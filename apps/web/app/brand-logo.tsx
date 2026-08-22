import Image from 'next/image'
import Link from 'next/link'

export default function BrandLogo({href='/',priority=false}:{href?:string;priority?:boolean}){
 return <Link className="brand" href={href} aria-label="TakeProp home">
  <Image src="/brand/takeprop-logo.png" alt="TakeProp" width={920} height={256} priority={priority} sizes="(max-width: 640px) 145px, 190px"/>
 </Link>
}
