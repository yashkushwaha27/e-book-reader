export const ROUTES = {
  HOME: "/",
  LIBRARY: "/library",
  TEMPLATES: "/templates",
  OFFLINE_DATA: "/offline-data",
  read: (bookId: string) => `/read/${bookId}` as const,
} as const;
