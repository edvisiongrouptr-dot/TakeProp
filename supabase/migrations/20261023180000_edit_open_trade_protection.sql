begin;

create or replace function public.internal_update_trade_protection(
 p_user_id uuid,
 p_account_id uuid,
 p_trade_id uuid,
 p_symbol text,
 p_stop_loss numeric,
 p_take_profit numeric,
 p_mark numeric
) returns void language plpgsql security definer set search_path=''
as $function$
declare
 v_account public.trading_accounts%rowtype;
 v_trade public.trades%rowtype;
begin
 if p_mark is null or p_mark<=0 then raise exception 'Trusted market price is unavailable';end if;

 select * into v_account from public.trading_accounts
 where id=p_account_id and user_id=p_user_id for update;
 if not found then raise exception 'Trading account not found';end if;
 if v_account.status<>'active' then raise exception 'Trading account is not active';end if;

 select * into v_trade from public.trades
 where id=p_trade_id and account_id=p_account_id and user_id=p_user_id for update;
 if not found then raise exception 'Open position not found';end if;
 if v_trade.closed_at is not null then raise exception 'Closed positions cannot be edited';end if;
 if v_trade.symbol<>p_symbol then raise exception 'Position symbol mismatch';end if;

 perform public.internal_validate_protection(v_trade.side,p_mark,p_stop_loss,p_take_profit);

 update public.trades set
  stop_loss=p_stop_loss,
  take_profit=p_take_profit,
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('protection_updated_at',now())
 where id=p_trade_id;
end;$function$;

revoke all on function public.internal_update_trade_protection(uuid,uuid,uuid,text,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.internal_update_trade_protection(uuid,uuid,uuid,text,numeric,numeric,numeric) to service_role;

commit;
