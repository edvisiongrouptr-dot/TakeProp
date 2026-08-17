import { MetadataRoute } from 'next'
const paths=['','/auth','/support','/terms','/privacy','/risk-disclosure','/refund-policy','/aml-kyc']
export default function sitemap():MetadataRoute.Sitemap{const lastModified=new Date();return paths.map(path=>({url:`https://takeprop.vercel.app${path}`,lastModified}))}
