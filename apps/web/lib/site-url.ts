export function siteUrl(){const configured=process.env.NEXT_PUBLIC_SITE_URL?.trim();try{return new URL(configured||'https://takeprop.vercel.app')}catch{return new URL('https://takeprop.vercel.app')}}
