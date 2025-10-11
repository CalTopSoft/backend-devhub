export function generateSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  
  export function generateCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }