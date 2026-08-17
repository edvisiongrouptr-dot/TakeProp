import { MetadataRoute } from 'next'
export default function sitemap():MetadataRoute.Sitemap{return[{url:'https://takeprop.vercel.app',lastModified:new Date(),changeFrequency:'weekly',priority:1},{url:'https://takeprop.vercel.app/auth',lastModified:new Date(),changeFrequency:'monthly',priority:.5}]}
