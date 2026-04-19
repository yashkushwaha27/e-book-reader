export const ROUTES = {
  HOME: "/",
  TEMPLATES: "/templates",
  read: (bookId: string) => `/read/${bookId}` as const,
} as const;
