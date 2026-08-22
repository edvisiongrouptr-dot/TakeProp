import {timingSafeEqual} from 'node:crypto'

export function bearerMatches(header:string|null,expected:string|undefined){
 if(!expected)return false
 const provided=header?.replace(/^Bearer\s+/,'')||''
 const left=Buffer.from(provided),right=Buffer.from(expected)
 return left.length===right.length&&timingSafeEqual(left,right)
}
