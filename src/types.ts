export interface XtreamConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Channel {
  id: string;
  name: string;
  number: number;
  logo: string;
  categoryId: string;
}

export const ALL_CATEGORY_ID = 'all';

export const ALL_CATEGORY: Category = {
  id: ALL_CATEGORY_ID,
  name: 'All',
};

export type Section = 'live' | 'movies' | 'series';

export type ViewTarget = 'home' | Section;
