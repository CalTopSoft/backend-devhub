// src/controllers/downloads.controller.ts
import { Request, Response } from 'express';
import Project from '../models/Project';
import axios from 'axios';
import path from 'path';

// Helper para obtener el MIME type correcto
function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

export async function downloadApp(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);

    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (project.status !== 'published') return res.status(403).json({ error: 'No disponible públicamente' });
    if (!project.files?.app || !project.files.app.url) return res.status(404).json({ error: 'App no disponible' });

    if (project.files.app.type === 'external') {
      return res.redirect(project.files.app.url);
    }

    return res.status(400).json({ error: 'Tipo de archivo no soportado' });
  } catch (error: any) {
    console.error('[ERROR downloadApp]:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function downloadCode(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);

    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (project.status !== 'published') return res.status(403).json({ error: 'No disponible públicamente' });
    if (!project.files?.code) return res.status(404).json({ error: 'Código no disponible' });

    if (project.files.code.type === 'cloudinary') {
      const downloadUrl = project.files.code.url.replace('/upload/', '/upload/fl_attachment/');
      
      // ✅ Tipar explícitamente como ArrayBuffer
      const response = await axios.get<ArrayBuffer>(downloadUrl, { 
        responseType: 'arraybuffer'
      });

      const fileName = project.files.code.fileName || 'codigo.zip';
      const mimeType = getMimeType(fileName);
      
      // ✅ Crear buffer desde ArrayBuffer
      const buffer = Buffer.from(response.data);
      
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);

      return res.send(buffer);
    }

    return res.status(400).json({ error: 'Tipo no soportado' });
  } catch (error: any) {
    console.error('[ERROR downloadCode]:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}

export async function downloadDoc(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);

    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (project.status !== 'published') return res.status(403).json({ error: 'No disponible públicamente' });
    if (!project.files?.docPdf) return res.status(404).json({ error: 'Documentación no disponible' });

    if (project.files.docPdf.type === 'cloudinary') {
      const downloadUrl = project.files.docPdf.url.replace('/upload/', '/upload/fl_attachment/');
      
      // ✅ Tipar explícitamente como ArrayBuffer
      const response = await axios.get<ArrayBuffer>(downloadUrl, { 
        responseType: 'arraybuffer'
      });

      const fileName = project.files.docPdf.fileName || 'documento.pdf';
      const mimeType = getMimeType(fileName);
      
      // ✅ Crear buffer desde ArrayBuffer
      const buffer = Buffer.from(response.data);
      
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);

      return res.send(buffer);
    }

    return res.status(400).json({ error: 'Tipo no soportado' });
  } catch (error: any) {
    console.error('[ERROR downloadDoc]:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}