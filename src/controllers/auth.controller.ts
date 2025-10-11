import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User';
import { env } from '../config/env';
import { z } from 'zod';
import { sendResetPasswordEmail } from '../services/email.service';

const registerSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
});

const confirmResetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(6),
});

export async function register(req: Request, res: Response) {
  try {
    const { username, email, password } = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, email, passwordHash });
    await user.save();
    const token = jwt.sign({ id: user._id, role: user.role }, env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const { email } = resetPasswordSchema.parse(req.body);
    
    // ✅ CAPTURAR EL ORIGIN DEL REQUEST
    const origin = req.headers.origin || req.headers.referer?.split('?')[0].replace(/\/$/, '') || env.FRONTEND_ORIGIN;
    console.log('[RESET PASSWORD] Origin detectado:', origin);
    console.log('[RESET PASSWORD] Headers:', { origin: req.headers.origin, referer: req.headers.referer });
    
    // Buscar usuario por email principal o emails de contacto
    const user = await User.findOne({
      $or: [
        { email },
        { 'contacts.email': email },
        { 'contacts.outlook': email }
      ]
    });

    if (!user) {
      // Por seguridad, siempre retornamos el mismo mensaje
      return res.json({ message: 'Si el correo existe, se ha enviado un enlace de recuperación' });
    }

    // Verificar límite de intentos por día
    const now = new Date();
    const lastAttempt = user.resetPasswordLastAttempt;
    const isSameDay = lastAttempt && 
      lastAttempt.getDate() === now.getDate() &&
      lastAttempt.getMonth() === now.getMonth() &&
      lastAttempt.getFullYear() === now.getFullYear();

    if (isSameDay && user.resetPasswordAttempts && user.resetPasswordAttempts >= 3) {
      return res.status(429).json({ 
        error: 'Límite de intentos diario alcanzado. Intenta mañana.' 
      });
    }

    // Verificar si hay un token válido reciente (para evitar spam)
    if (user.resetPasswordExpires && user.resetPasswordExpires > now) {
      return res.status(429).json({ 
        error: 'Ya se ha enviado un enlace de recuperación. Espera 5 minutos antes de solicitar otro.' 
      });
    }

    // Generar token seguro
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Actualizar usuario con información del reset
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos
    user.resetPasswordAttempts = isSameDay ? (user.resetPasswordAttempts || 0) + 1 : 1;
    user.resetPasswordLastAttempt = now;

    await user.save();

    // ✅ ENVIAR EMAIL CON EL ORIGIN
    await sendResetPasswordEmail({
      to: email,
      username: user.username,
      resetToken,
      origin: origin as string // ← NUEVO PARÁMETRO
    });

    res.json({ message: 'Si el correo existe, se ha enviado un enlace de recuperación' });

  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

export async function confirmResetPassword(req: Request, res: Response) {
  try {
    const { token, newPassword } = confirmResetPasswordSchema.parse(req.body);

    // Hash del token recibido
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Buscar usuario con el token válido y no expirado
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Token inválido o expirado' 
      });
    }

    // Actualizar contraseña
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    // No reseteamos los attempts para mantener el límite diario

    await user.save();

    res.json({ message: 'Contraseña actualizada exitosamente' });

  } catch (error) {
    console.error('Error in confirmResetPassword:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}