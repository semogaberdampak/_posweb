-- Pemeriksaan keutuhan (hanya MEMBACA, tidak mengubah data). Jalankan di SQL Editor kapan saja.
-- 1) Stok yang tidak cocok dengan jumlah riwayat pergerakannya. Hasil harus KOSONG.
--    (Stok yang diisi manual lewat SQL tanpa riwayat, mis. data percobaan, akan muncul di sini.)
select b.code as cabang, p.code as produk, s.qty as stok, coalesce(m.t, 0) as dari_riwayat
from stock s
join branches b on b.id = s.branch_id
join products p on p.id = s.product_id
left join (select branch_id, product_id, sum(qty_change) t from stock_movements group by 1, 2) m
  on m.branch_id = s.branch_id and m.product_id = s.product_id
where s.qty <> coalesce(m.t, 0);

-- 2) Stok minus. Hasil harus KOSONG.
select * from stock where qty < 0;

-- 3) Transaksi yang total-nya tidak sama dengan jumlah barisnya. Hasil harus KOSONG.
select s.invoice_no
from sales s join sale_items i on i.sale_id = s.id
group by s.id, s.invoice_no, s.subtotal, s.discount_amount, s.total
having s.subtotal <> sum(i.unit_price * i.qty) or s.total <> sum(i.line_total) or s.total <> s.subtotal - s.discount_amount;

-- 4) Ringkasan stok per cabang (untuk dibandingkan dengan hitung fisik / total Excel)
select b.name as cabang, count(*) filter (where s.qty > 0) as produk_berstok, coalesce(sum(s.qty), 0) as total_pcs
from branches b left join stock s on s.branch_id = b.id
group by b.name order by b.name;
