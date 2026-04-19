export const ROUTES = {
  HOME: "/",
  LIBRARY: "/library",
  TEMPLATES: "/templates",
  read: (bookId: string) => `/read/${bookId}` as const,
} as const;
