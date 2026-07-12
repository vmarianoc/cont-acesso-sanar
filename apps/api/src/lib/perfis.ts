// Perfis de usuário do sistema. `administradora` é uma empresa que gerencia
// vários condomínios (multi-tenant via /auth/contas + /auth/trocar-condominio);
// `superadmin` é a equipe interna da Condar, dona da plataforma.
export type Perfil = 'superadmin' | 'admin' | 'porteiro' | 'morador' | 'sindico' | 'administradora'

// Rotas de gestão do condomínio (comunicados, documentos, ocorrências, etc.).
// Tipado como Set<string> porque o perfil do JWT chega como string solta nas rotas.
export const PERFIS_GESTAO: Set<string> = new Set<Perfil>(['admin', 'sindico', 'superadmin', 'administradora'])

// Importação em massa de unidades (cadastro).
export const PERFIS_IMPORT: Set<string> = new Set<Perfil>(['admin', 'sindico', 'superadmin', 'administradora'])
