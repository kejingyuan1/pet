-- ============================================================
-- 我的宠物乐园 数据库初始化脚本（MySQL 5.7+/8）
-- 用法：mysql -uroot -p < schema.sql
-- ============================================================
CREATE DATABASE IF NOT EXISTS pet_park DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pet_park;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  username    VARCHAR(32)  NOT NULL UNIQUE,
  password    VARCHAR(100) NOT NULL,              -- BCrypt 哈希
  nickname    VARCHAR(32)  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 玩家档案（一用户一档；state JSON 直存，前端结构无感）
CREATE TABLE IF NOT EXISTS players (
  user_id     BIGINT PRIMARY KEY,
  state_json  JSON         NOT NULL,              -- 完整 state 对象（前端结构）
  version     INT          NOT NULL DEFAULT 7,    -- 对应前端 LS_KEY 版本号
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_players_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 事件日志（可选：把 state.logs 抽成行，便于统计/排行）
CREATE TABLE IF NOT EXISTS logs (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL,
  type       VARCHAR(16)  NOT NULL,               -- feed/play/harvest/watch/study/level...
  text       VARCHAR(255) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_logs_user (user_id, created_at),
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 统一类目表（种植植物 / 养殖鱼 / 养殖动物 / 家具 ... 全部一张表）
-- type 字段区分大类；价格、成长时间、产出物等字段全在此
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(32)  NOT NULL UNIQUE,       -- 标识：carrot / goldfish / chicken / bed
  name        VARCHAR(32)  NOT NULL,              -- 中文名
  type        VARCHAR(16)  NOT NULL,              -- 大类：crop 植物 | fish 鱼 | animal 动物 | furniture 家具
  price       INT          NOT NULL DEFAULT 0,    -- 购买价（金币）
  sell_price  INT          NOT NULL DEFAULT 0,    -- 成熟/产出后售价
  grow_days   DECIMAL(5,2) NOT NULL DEFAULT 0,    -- 成长所需天数
  feed_days   DECIMAL(5,2) NOT NULL DEFAULT 0,    -- 浇水/喂养间隔（天）
  exp         INT          NOT NULL DEFAULT 0,    -- 收获/售卖所得经验
  level_req   INT          NOT NULL DEFAULT 1,    -- 解锁所需等级（或设施等级）
  product     VARCHAR(32)  DEFAULT NULL,          -- 产出物名称（动物：鸡蛋/鸭蛋/牛奶）
  prod_price  INT          NOT NULL DEFAULT 0,    -- 产出物售价
  satiety     INT          NOT NULL DEFAULT 0,    -- 作为宠物食物时的饱食增加值
  energy      INT          NOT NULL DEFAULT 0,    -- 作为宠物食物时的体力增加值
  color       VARCHAR(16)  NOT NULL DEFAULT '#FFFFFF',
  icon_svg    TEXT         DEFAULT NULL,          -- 可选：SVG 图标（不设则用 code 默认样式）
  status      TINYINT      NOT NULL DEFAULT 1,    -- 1 启用 / 0 停用
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cat_type (type, status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ★ 幂等保护：重新执行本脚本时，先清空类目种子表（不删 users/players/logs 业务数据）
DELETE FROM categories;

-- 类目初始数据
INSERT INTO categories (code,name,type,price,sell_price,grow_days,feed_days,exp,level_req,product,prod_price,satiety,energy,color,sort_order) VALUES
 ('carrot','胡萝卜','crop',5,8,0.30,0.10,10,1,NULL,0,15,12,'#FF9E4A',10),
 ('tomato','番茄','crop',8,12,0.50,0.15,13,1,NULL,0,18,16,'#E63946',11),
 ('strawberry','草莓','crop',14,20,0.80,0.20,16,2,NULL,0,22,20,'#FF6B9D',12),
 ('watermelon','西瓜','crop',25,36,1.20,0.25,20,3,NULL,0,30,25,'#06D6A0',13),
 ('minnow','小鱼','fish',6,9,0.40,0.10,8,1,NULL,0,0,0,'#4CC9F0',20),
 ('goldfish','金鱼','fish',10,14,0.60,0.15,12,1,NULL,0,0,0,'#FFD166',21),
 ('koi','锦鲤','fish',18,26,0.90,0.20,16,2,NULL,0,0,0,'#FF6B9D',22),
 ('dragon','龙鱼','fish',30,44,1.30,0.25,22,3,NULL,0,0,0,'#06D6A0',23),
 ('chicken','鸡','animal',8,15,0.40,0.10,9,1,'鸡蛋',3,0,0,'#FFD166',30),
 ('duck','鸭','animal',12,22,0.60,0.15,13,1,'鸭蛋',5,0,0,'#4CC9F0',31),
 ('cow','牛','animal',25,45,1.00,0.20,18,2,'牛奶',9,0,0,'#C9A0FF',32),
 ('bed','小床','furniture',40,0,0,0,0,1,NULL,0,0,0,'#C98A4B',40),
 ('sofa','沙发','furniture',60,0,0,0,0,1,NULL,0,0,0,'#EF476F',41),
 ('table','桌子','furniture',30,0,0,0,0,1,NULL,0,0,0,'#C98A4B',42),
 ('flower','花盆','furniture',15,0,0,0,0,1,NULL,0,0,0,'#EF476F',43),
 ('rug','地毯','furniture',25,0,0,0,0,1,NULL,0,0,0,'#4CC9F0',44),
 ('lamp','台灯','furniture',20,0,0,0,0,1,NULL,0,0,0,'#F0A500',45),
 ('shelf','书架','furniture',50,0,0,0,0,1,NULL,0,0,0,'#C98A4B',46),
 ('tv','电视','furniture',80,0,0,0,0,1,NULL,0,0,0,'#5EC4EA',47)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ============================================================
-- 学习题库表（兼容多科目 + 多题型）
-- subject 区分科目：english / hanzi / chengyu / math / thinking
-- q_type  区分题型：choice 单选 | match 配对 | fill 填空 | qa 问答
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  subject     VARCHAR(16)  NOT NULL,              -- 科目：english|hanzi|chengyu|math|thinking
  q_type      VARCHAR(16)  NOT NULL DEFAULT 'choice',
  group_id    VARCHAR(32)  DEFAULT NULL,          -- 分组标识（animals / 加法 / 反义词...）
  group_name  VARCHAR(32)  DEFAULT NULL,
  prompt      TEXT         NOT NULL,              -- 题干（支持 JSON：图片/富文本）
  options     JSON         DEFAULT NULL,          -- 选择题选项 [{text, correct, icon}]
  answer      TEXT         DEFAULT NULL,          -- 正确答案（match 存映射 JSON / fill 存文本 / qa 存参考）
  level       INT          NOT NULL DEFAULT 1,    -- 难度 1-5
  points      INT          NOT NULL DEFAULT 1,    -- 答对金币
  status      TINYINT      NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ques_subject (subject, status, level),
  -- ★ 唯一索引：防止重复执行初始化时题库翻倍（配合下方 ON DUPLICATE KEY UPDATE）
  UNIQUE KEY uk_ques_subject_group_prompt (subject, group_id, prompt(200))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ★ 幂等保护：重新执行本脚本时，先清空题库种子表（不删 users/players/logs 业务数据）
DELETE FROM questions;

-- 题库初始数据（五科目完整题库，与前端 STUDY_SUBJECTS 对齐）
INSERT INTO questions (subject,q_type,group_id,group_name,prompt,options,answer,level,points) VALUES
-- 英语·动物
 ('english','choice','animals','动物','cat 的意思是？','[{"text":"狗"},{"text":"猫","correct":true},{"text":"鸟"},{"text":"鱼"}]','猫',1,1),
 ('english','choice','animals','动物','dog 的意思是？','[{"text":"猫"},{"text":"鱼"},{"text":"狗","correct":true},{"text":"兔子"}]','狗',1,1),
 ('english','choice','animals','动物','bird 的意思是？','[{"text":"鸟","correct":true},{"text":"鱼"},{"text":"猫"},{"text":"牛"}]','鸟',1,1),
 ('english','choice','animals','动物','fish 的意思是？','[{"text":"鸟"},{"text":"鱼","correct":true},{"text":"狗"},{"text":"兔子"}]','鱼',1,1),
 ('english','choice','animals','动物','rabbit 的意思是？','[{"text":"猫"},{"text":"狗"},{"text":"兔子","correct":true},{"text":"老虎"}]','兔子',1,1),
-- 英语·水果
 ('english','choice','fruits','水果','apple 的意思是？','[{"text":"苹果","correct":true},{"text":"香蕉"},{"text":"葡萄"},{"text":"西瓜"}]','苹果',1,1),
 ('english','choice','fruits','水果','banana 的意思是？','[{"text":"苹果"},{"text":"香蕉","correct":true},{"text":"橙子"},{"text":"草莓"}]','香蕉',1,1),
 ('english','choice','fruits','水果','grape 的意思是？','[{"text":"西瓜"},{"text":"橙子"},{"text":"葡萄","correct":true},{"text":"桃子"}]','葡萄',1,1),
 ('english','choice','fruits','水果','orange 的意思是？','[{"text":"苹果"},{"text":"葡萄"},{"text":"香蕉"},{"text":"橙子","correct":true}]','橙子',1,1),
 ('english','choice','fruits','水果','watermelon 的意思是？','[{"text":"西瓜","correct":true},{"text":"葡萄"},{"text":"苹果"},{"text":"梨"}]','西瓜',1,1),
-- 英语·颜色
 ('english','choice','colors','颜色','red 的意思是？','[{"text":"蓝色"},{"text":"红色","correct":true},{"text":"绿色"},{"text":"黄色"}]','红色',1,1),
 ('english','choice','colors','颜色','blue 的意思是？','[{"text":"红色"},{"text":"绿色"},{"text":"蓝色","correct":true},{"text":"粉色"}]','蓝色',1,1),
 ('english','choice','colors','颜色','green 的意思是？','[{"text":"黄色"},{"text":"绿色","correct":true},{"text":"红色"},{"text":"黑色"}]','绿色',1,1),
 ('english','choice','colors','颜色','yellow 的意思是？','[{"text":"粉色"},{"text":"蓝色"},{"text":"黄色","correct":true},{"text":"紫色"}]','黄色',1,1),
 ('english','choice','colors','颜色','pink 的意思是？','[{"text":"粉色","correct":true},{"text":"橙色"},{"text":"棕色"},{"text":"白色"}]','粉色',1,1),
-- 数学·10以内加法
 ('math','choice','add10','10以内加法','3 + 4 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
 ('math','choice','add10','10以内加法','2 + 5 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
 ('math','choice','add10','10以内加法','4 + 4 = ?','[{"text":"6"},{"text":"7"},{"text":"8","correct":true},{"text":"9"}]','8',1,2),
 ('math','choice','add10','10以内加法','1 + 9 = ?','[{"text":"8"},{"text":"9"},{"text":"10","correct":true},{"text":"11"}]','10',1,2),
 ('math','choice','add10','10以内加法','5 + 2 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
-- 数学·10以内减法
 ('math','choice','sub10','10以内减法','8 - 3 = ?','[{"text":"4"},{"text":"6"},{"text":"5","correct":true},{"text":"7"}]','5',1,2),
 ('math','choice','sub10','10以内减法','9 - 4 = ?','[{"text":"4"},{"text":"5","correct":true},{"text":"6"},{"text":"7"}]','5',1,2),
 ('math','choice','sub10','10以内减法','7 - 2 = ?','[{"text":"4"},{"text":"5","correct":true},{"text":"6"},{"text":"7"}]','5',1,2),
 ('math','choice','sub10','10以内减法','10 - 6 = ?','[{"text":"3"},{"text":"4","correct":true},{"text":"5"},{"text":"6"}]','4',1,2),
 ('math','choice','sub10','10以内减法','6 - 1 = ?','[{"text":"3"},{"text":"4"},{"text":"5","correct":true},{"text":"6"}]','5',1,2),
-- 数学·填空
 ('math','fill','fill10','数字填空','5 + __ = 8','[]','3',1,2),
 ('math','fill','fill10','数字填空','__ + 2 = 9','[]','7',1,2),
 ('math','fill','fill10','数字填空','10 - __ = 4','[]','6',1,2),
 ('math','fill','fill10','数字填空','__ - 3 = 5','[]','8',1,2),
 ('math','fill','fill10','数字填空','4 + __ = 10','[]','6',1,2),
-- 汉字·认一认（qa）
 ('hanzi','qa','basic','认一认','"日" 是什么？','[]','太阳。也指"天"，比如：今天、日子。',1,2),
 ('hanzi','qa','basic','认一认','"月" 是什么？','[]','月亮。也指月份，比如：一月、二月。',1,2),
 ('hanzi','qa','basic','认一认','"山" 是什么？','[]','山丘、高山。组词：大山、爬山。',1,2),
 ('hanzi','qa','basic','认一认','"水" 是什么？','[]','水。组词：喝水、水果、河水。',1,2),
 ('hanzi','qa','basic','认一认','"火" 是什么？','[]','火。组词：火车、火山、生火。',1,2),
-- 汉字·反义词
 ('hanzi','choice','antonym','反义词','"大" 的反义词是？','[{"text":"小","correct":true},{"text":"高"},{"text":"多"}]','小',1,2),
 ('hanzi','choice','antonym','反义词','"上" 的反义词是？','[{"text":"前"},{"text":"下","correct":true},{"text":"左"}]','下',1,2),
 ('hanzi','choice','antonym','反义词','"冷" 的反义词是？','[{"text":"凉"},{"text":"冰"},{"text":"热","correct":true}]','热',1,2),
 ('hanzi','choice','antonym','反义词','"快" 的反义词是？','[{"text":"慢","correct":true},{"text":"飞"},{"text":"急"}]','慢',1,2),
 ('hanzi','choice','antonym','反义词','"开" 的反义词是？','[{"text":"关","correct":true},{"text":"启"},{"text":"放"}]','关',1,2),
-- 成语·动物成语
 ('chengyu','choice','animal','动物成语','对牛弹琴中"牛"是什么？','[{"text":"哺乳动物","correct":true},{"text":"植物"},{"text":"石头"},{"text":"乐器"}]','哺乳动物',2,2),
 ('chengyu','choice','animal','动物成语','画蛇添足中"蛇"没有哪样东西？','[{"text":"脚","correct":true},{"text":"头"},{"text":"尾巴"},{"text":"身体"}]','脚',2,2),
 ('chengyu','choice','animal','动物成语','亡羊补牢指的是什么羊？','[{"text":"丢失的羊","correct":true},{"text":"跑得快的羊"},{"text":"白色的羊"},{"text":"小羊"}]','丢失的羊',2,2),
 ('chengyu','choice','animal','动物成语','守株待兔中农夫等的是什么？','[{"text":"兔子","correct":true},{"text":"老虎"},{"text":"狐狸"},{"text":"小鸟"}]','兔子',2,2),
 ('chengyu','choice','animal','动物成语','狐假虎威中谁借着老虎的威风？','[{"text":"狐狸","correct":true},{"text":"猴子"},{"text":"狼"},{"text":"狮子"}]','狐狸',2,2),
-- 成语·常用成语
 ('chengyu','choice','common','常用成语','一心一意形容什么？','[{"text":"专心","correct":true},{"text":"害怕"},{"text":"开心"},{"text":"生气"}]','专心',2,2),
 ('chengyu','choice','common','常用成语','半途而废指做事怎么样？','[{"text":"坚持到底"},{"text":"做到一半放弃","correct":true},{"text":"很快完成"},{"text":"慢慢做"}]','做到一半放弃',2,2),
 ('chengyu','choice','common','常用成语','马到成功常用来祝福什么？','[{"text":"出行办事顺利","correct":true},{"text":"考试失败"},{"text":"生病"},{"text":"下雨"}]','出行办事顺利',2,2),
 ('chengyu','choice','common','常用成语','井底之蛙比喻什么？','[{"text":"见识短浅的人","correct":true},{"text":"很聪明的人"},{"text":"跳得高的人"},{"text":"爱干净的人"}]','见识短浅的人',2,2),
 ('chengyu','choice','common','常用成语','亡羊补牢告诉我们什么道理？','[{"text":"出了问题要及时补救","correct":true},{"text":"不要养羊"},{"text":"羊很危险"},{"text":"要睡懒觉"}]','出了问题要及时补救',2,2),
-- 思维·逻辑推理
 ('thinking','choice','logic','逻辑推理','小明比小红高，小红比小刚高，谁最高？','[{"text":"小刚"},{"text":"小红"},{"text":"小明","correct":true},{"text":"一样高"}]','小明',2,3),
 ('thinking','choice','logic','逻辑推理','香蕉比苹果贵，苹果比梨贵，最便宜的是？','[{"text":"香蕉"},{"text":"苹果"},{"text":"梨","correct":true},{"text":"一样贵"}]','梨',2,3),
 ('thinking','choice','logic','逻辑推理','今天是星期二，再过 3 天是星期几？','[{"text":"星期三"},{"text":"星期四"},{"text":"星期五","correct":true},{"text":"星期六"}]','星期五',2,3),
 ('thinking','choice','logic','逻辑推理','哥哥今年 10 岁，弟弟比哥哥小 3 岁，弟弟几岁？','[{"text":"5岁"},{"text":"6岁"},{"text":"7岁","correct":true},{"text":"8岁"}]','7岁',2,3),
 ('thinking','choice','logic','逻辑推理','红球比蓝球大，蓝球比绿球大，最小的是？','[{"text":"红球"},{"text":"蓝球"},{"text":"绿球","correct":true},{"text":"一样大"}]','绿球',2,3),
-- 思维·找规律
 ('thinking','choice','series','找规律','1、3、5、7、__？','[{"text":"8"},{"text":"9","correct":true},{"text":"10"},{"text":"11"}]','9',2,3),
 ('thinking','choice','series','找规律','2、4、6、8、__？','[{"text":"9"},{"text":"10","correct":true},{"text":"11"},{"text":"12"}]','10',2,3),
 ('thinking','choice','series','找规律','10、8、6、4、__？','[{"text":"1"},{"text":"2","correct":true},{"text":"3"},{"text":"5"}]','2',2,3),
 ('thinking','choice','series','找规律','1、2、4、7、__？','[{"text":"9"},{"text":"10"},{"text":"11","correct":true},{"text":"12"}]','11',2,3),
 ('thinking','choice','series','找规律','5、10、15、20、__？','[{"text":"21"},{"text":"22"},{"text":"24"},{"text":"25","correct":true}]','25',2,3)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);
