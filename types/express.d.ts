// types/express.d.ts

// Define una interfaz simple para el usuario en el request
declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      _id: string;
      username: string;
      email: string;
      role?: 'user' | 'admin';
      photo?: string;
      career?: string;
      semester?: number;
      age?: number;
      contacts?: {
        whatsapp?: string;
        email?: string;
        outlook?: string;
      };
      companiesCount?: number;
    };
  }
}