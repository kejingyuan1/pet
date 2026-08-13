-- M4 采矿：增量补 users.energy_updated_at + 矿石 categories 种子
-- 与 schema.sql 同源守卫逻辑，可重复执行不报错。

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='energy_updated_at');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN energy_updated_at DATETIME DEFAULT NULL COMMENT ''采矿能量最后再生时间戳（懒再生基准）'' AFTER experience', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

INSERT INTO categories (code,name,type,price,sell_price,grow_days,feed_days,exp,level_req,product,prod_price,satiety,energy,color,sort_order) VALUES
 ('ore_coal','煤矿','resource',0,5,0,0,10,1,NULL,0,0,0,'#3A3A3A',70),
 ('ore_iron','铁矿','resource',0,12,0,0,16,1,NULL,0,0,0,'#B0B0B0',71),
 ('ore_gold','金矿','resource',0,30,0,0,25,2,NULL,0,0,0,'#FFD700',72)
ON DUPLICATE KEY UPDATE name=VALUES(name);

SELECT 'apply-m4-mining done' AS status;
