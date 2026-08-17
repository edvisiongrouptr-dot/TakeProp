#!/usr/bin/env bash
set -euo pipefail
cd /workspaces/TakeProp
mkdir -p apps/web/app/admin 'apps/web/app/api/admin/orders/[id]/review' supabase/migrations

cat > supabase/migrations/20260817110000_admin_usdt_payment_review.sql <<'SQL'
alter table public.orders add column if not exists reviewed_by uuid references auth.users(id), add column if not exists reviewed_at timestamptz, add column if not exists review_note text;
create or replace function private.review_usdt_order(p_order_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; p public.challenge_plans%rowtype; a uuid; reviewer uuid := (select auth.uid());
begin
 if reviewer is null or not private.has_app_role(array['admin','finance']) then raise exception 'Not authorized'; end if;
 if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status<>'pending' then raise exception 'Order has already been reviewed'; end if;
 if o.payment_provider not in ('usdt_bep20','usdt_erc20','usdt_trc20','usdt_ton') then raise exception 'Unsupported payment provider'; end if;
 if p_decision='reject' then
  update public.orders set status='failed',reviewed_by=reviewer,reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=p_order_id;
  return jsonb_build_object('ok',true,'status','failed');
 end if;
 select * into p from public.challenge_plans where id=o.plan_id;
 if not found then raise exception 'Plan not found'; end if;
 insert into public.trading_accounts(user_id,plan_id,order_id,provider,provider_account_id,display_account_id,phase,status,starting_balance,balance,equity,high_water_mark,daily_start_equity,daily_start_balance,total_pnl,daily_pnl,started_at)
 values(o.user_id,o.plan_id,o.id,'takeprop_simulated','order-'||o.id,'TP-'||upper(substr(replace(o.id::text,'-',''),1,10)),'challenge','active',p.account_size,p.account_size,p.account_size,p.account_size,p.account_size,p.account_size,0,0,now()) returning id into a;
 update public.orders set status='paid',paid_at=now(),reviewed_by=reviewer,reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=p_order_id;
 return jsonb_build_object('ok',true,'status','paid','account_id',a);
end $$;
revoke all on function private.review_usdt_order(uuid,text,text) from public,anon,authenticated;
grant execute on function private.review_usdt_order(uuid,text,text) to authenticated;
create or replace function public.admin_review_usdt_order(p_order_id uuid,p_decision text,p_note text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.review_usdt_order(p_order_id,p_decision,p_note); $$;
revoke all on function public.admin_review_usdt_order(uuid,text,text) from public,anon;
grant execute on function public.admin_review_usdt_order(uuid,text,text) to authenticated;
grant select on public.user_roles to authenticated;
SQL

cat > apps/web/app/admin/page.tsx <<'TSX'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, getOwnData } from '../../lib/supabase-rest'
import PaymentActions from './payment-actions'
import styles from './admin.module.css'
type Role={role:string}
type Profile={id:string;full_name:string|null}
type Order={id:string;user_id:string;amount:number;currency:string;status:string;payment_provider:string|null;provider_payment_id:string|null;created_at:string;challenge_plans:{name:string;account_size:number}|null}
export const dynamic='force-dynamic'
export default async function AdminPage(){
 const auth=await getAuthenticatedUser(); if(!auth) redirect('/auth?next=/admin')
 const roles=await getOwnData<Role[]>(`user_roles?select=role&user_id=eq.${auth.user.id}`,auth.accessToken)
 if(!roles.some(r=>r.role==='admin'||r.role==='finance')) redirect('/dashboard')
 const [orders,profiles]=await Promise.all([
  getOwnData<Order[]>('orders?select=id,user_id,amount,currency,status,payment_provider,provider_payment_id,created_at,challenge_plans(name,account_size)&payment_provider=like.usdt_*&order=created_at.desc&limit=100',auth.accessToken),
  getOwnData<Profile[]>('profiles?select=id,full_name',auth.accessToken)
 ])
 const names=new Map(profiles.map(p=>[p.id,p.full_name||p.id.slice(0,8)])),pending=orders.filter(o=>o.status==='pending'),reviewed=orders.filter(o=>o.status!=='pending')
 return <main className={styles.page}><header className={styles.header}><div><small>TAKEPROP OPERATIONS</small><h1>Payment review</h1><p>Verify the transaction on the correct blockchain before approving it.</p></div><Link href="/dashboard">Trader dashboard →</Link></header>
 <section><div className={styles.title}><h2>Pending payments</h2><b>{pending.length}</b></div>{pending.length===0?<div className={styles.empty}>No payments are waiting for review.</div>:<div className={styles.grid}>{pending.map(o=><Card key={o.id} order={o} name={names.get(o.user_id)||o.user_id.slice(0,8)} pending/>)}</div>}</section>
 <section><div className={styles.title}><h2>Review history</h2><b>{reviewed.length}</b></div><div className={styles.grid}>{reviewed.map(o=><Card key={o.id} order={o} name={names.get(o.user_id)||o.user_id.slice(0,8)}/>)}</div></section></main>
}
function Card({order,name,pending=false}:{order:Order;name:string;pending?:boolean}){const network=(order.payment_provider||'').replace('usdt_','').toUpperCase();return <article className={styles.card}><div className={styles.head}><span>{order.status.toUpperCase()}</span><time>{new Date(order.created_at).toLocaleString('tr-TR')}</time></div><h3>{order.challenge_plans?.name||'Challenge plan'}</h3><strong>{Number(order.amount).toFixed(2)} {order.currency}</strong><dl><div><dt>Trader</dt><dd>{name}</dd></div><div><dt>Account</dt><dd>USD {Number(order.challenge_plans?.account_size||0).toLocaleString('en-US')}</dd></div><div><dt>Network</dt><dd>{network}</dd></div><div><dt>Order</dt><dd>{order.id.slice(0,8).toUpperCase()}</dd></div></dl><label>Transaction hash</label><code>{order.provider_payment_id||'—'}</code>{order.provider_payment_id&&<a target="_blank" rel="noreferrer" href={explorer(network,order.provider_payment_id)}>Open blockchain explorer ↗</a>}{pending&&<PaymentActions orderId={order.id}/>}</article>}
function explorer(n:string,t:string){if(n==='BEP20')return 'https://bscscan.com/tx/'+t;if(n==='ERC20')return 'https://etherscan.io/tx/'+t;if(n==='TRC20')return 'https://tronscan.org/#/transaction/'+t;return 'https://tonviewer.com/transaction/'+t}
TSX

cat > apps/web/app/admin/payment-actions.tsx <<'TSX'
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './admin.module.css'
export default function PaymentActions({orderId}:{orderId:string}){const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');async function review(decision:'approve'|'reject'){const msg=decision==='approve'?'Did you verify network, address, amount and transaction status on-chain?':'Reject this payment submission?';if(!confirm(msg))return;setBusy(true);setError('');const r=await fetch(`/api/admin/orders/${orderId}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision})});const x=await r.json().catch(()=>({}));if(!r.ok){setError(x.error||'Review failed.');setBusy(false);return}router.refresh()}return <div className={styles.actions}><button disabled={busy} onClick={()=>review('approve')}>Approve & issue account</button><button disabled={busy} onClick={()=>review('reject')}>Reject</button>{error&&<p>{error}</p>}</div>}
TSX

cat > 'apps/web/app/api/admin/orders/[id]/review/route.ts' <<'TS'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getOwnData, postOwnData } from '../../../../../../lib/supabase-rest'
type Role={role:string}
export async function POST(request:Request,{params}:{params:{id:string}}){try{const auth=await getAuthenticatedUser();if(!auth)return NextResponse.json({error:'Sign in required.'},{status:401});const roles=await getOwnData<Role[]>(`user_roles?select=role&user_id=eq.${auth.user.id}`,auth.accessToken);if(!roles.some(r=>r.role==='admin'||r.role==='finance'))return NextResponse.json({error:'Not authorized.'},{status:403});const {decision,note}=await request.json();if(decision!=='approve'&&decision!=='reject')return NextResponse.json({error:'Invalid decision.'},{status:400});const result=await postOwnData('rpc/admin_review_usdt_order',auth.accessToken,{p_order_id:params.id,p_decision:decision,p_note:typeof note==='string'?note:null});return NextResponse.json({ok:true,result})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Review failed.'},{status:400})}}
TS

cat > apps/web/app/admin/admin.module.css <<'CSS'
.page{min-height:100vh;background:#050b0e;color:#f4f6f4;padding:clamp(24px,5vw,72px);font-family:Arial,sans-serif}.header{display:flex;justify-content:space-between;gap:30px;border-bottom:1px solid #1e3435;padding-bottom:32px;margin-bottom:48px}.header small,.title b,.card a{color:#62d89d}.header h1{font-size:clamp(40px,7vw,74px);margin:10px 0}.header p{color:#8a9893}.header a,.card a{text-decoration:none}.title{display:flex;align-items:center;gap:15px;margin:36px 0 18px}.title h2{margin:0}.title b{border:1px solid #285440;padding:7px 11px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:18px}.card,.empty{border:1px solid #203638;background:#091316;padding:24px}.head{display:flex;justify-content:space-between}.head span{color:#f1c85a}.head time{font-size:12px;color:#798884}.card h3{font-size:24px;margin:24px 0 7px}.card>strong{font-size:30px;color:#62d89d}.card dl{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:25px 0}.card dl div{border-top:1px solid #1b2d2f;padding-top:10px}.card dt,.card label{font-size:11px;color:#71817d;text-transform:uppercase}.card dd{margin:5px 0}.card code{display:block;margin:9px 0 14px;padding:13px;background:#04090b;overflow-wrap:anywhere}.actions{display:grid;grid-template-columns:2fr 1fr;gap:10px;border-top:1px solid #1e3435;padding-top:20px;margin-top:20px}.actions button{background:#42df91;padding:14px;font-weight:800;border:1px solid #31644e}.actions button:nth-child(2){background:transparent;color:#ef7777;border-color:#663737}.actions p{grid-column:1/-1;color:#ef7777}@media(max-width:650px){.header{display:block}.header a{display:inline-block;margin-top:18px}.card dl,.actions{grid-template-columns:1fr}.page{padding:24px 16px}}
CSS

git add apps/web/app/admin 'apps/web/app/api/admin/orders/[id]/review/route.ts' supabase/migrations/20260817110000_admin_usdt_payment_review.sql
git commit -m "Add secure admin payment review"
git push origin main
echo "DONE"
