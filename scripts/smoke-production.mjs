const base=(process.env.TAKEPROP_PRODUCTION_URL||process.env.NEXT_PUBLIC_SITE_URL||'https://takeprop.vercel.app').replace(/\/$/,'')
const checks=[['/',200],['/auth',200],['/terms',200],['/privacy',200],['/risk-disclosure',200],['/api/health',200]]
const failures=[]
for(const [path,status] of checks){
 try{
  const response=await fetch(`${base}${path}`,{redirect:'manual',signal:AbortSignal.timeout(15_000)})
  if(response.status!==status)failures.push(`${path}: expected ${status}, received ${response.status}`)
  else console.log(`OK ${path}`)
 }catch(error){failures.push(`${path}: ${error instanceof Error?error.message:'request failed'}`)}
}
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`Production smoke checks passed for ${base}.`)
