import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z.enum(['Environment', 'Health and Family', 'Local Guide', 'Mosquito Science', 'Outdoor Living']),
    draft: z.boolean().optional().default(false),
  }),
});

const areas = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    city: z.string(),
    county: z.string().optional(),
    description: z.string(),
    localDetail: z.string().optional(),
  }),
});

export const collections = { blog, areas };
