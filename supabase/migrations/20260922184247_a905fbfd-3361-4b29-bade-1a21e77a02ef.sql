CREATE OR REPLACE FUNCTION public.handle_payment_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD; v_total_paid NUMERIC(14,2); v_status invoice_status;
  v_receipt_no TEXT; v_item RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  SELECT COALESCE(SUM(amount),0) INTO v_total_paid FROM public.payments WHERE invoice_id = NEW.invoice_id;
  IF v_total_paid >= v_inv.total THEN v_status := 'paid';
  ELSIF v_total_paid > 0 THEN v_status := 'partial';
  ELSE v_status := v_inv.status; END IF;

  UPDATE public.invoices
    SET amount_paid = v_total_paid,
        balance = GREATEST(v_inv.total - v_total_paid, 0),
        status = v_status
    WHERE id = NEW.invoice_id;

  IF v_status = 'paid' THEN
    v_receipt_no := public.next_tenant_doc_number(v_inv.tenant_id, 'receipt');
    INSERT INTO public.receipts (tenant_id, receipt_number, invoice_id, customer_id, amount, method, payment_date, branch_id)
    VALUES (v_inv.tenant_id, v_receipt_no, v_inv.id, v_inv.customer_id, v_inv.total, NEW.method, NEW.payment_date,
            COALESCE(NEW.branch_id, v_inv.branch_id));
    IF NOT v_inv.stock_deducted THEN
      FOR v_item IN
        SELECT product_id, quantity FROM public.invoice_items
        WHERE invoice_id = v_inv.id AND product_id IS NOT NULL
      LOOP
        INSERT INTO public.stock_movements (tenant_id, product_id, change_qty, reason, reference, notes, created_by, branch_id)
        VALUES (v_inv.tenant_id, v_item.product_id, -v_item.quantity, 'sale', v_inv.invoice_number,
                'Auto-deducted on payment', NEW.created_by, COALESCE(NEW.branch_id, v_inv.branch_id));
      END LOOP;
      UPDATE public.invoices SET stock_deducted = true WHERE id = v_inv.id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;