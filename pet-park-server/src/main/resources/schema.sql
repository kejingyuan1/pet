-- ============================================================
-- 我的宠物乐园 数据库初始化脚本（MySQL 5.7+/8）
-- 用法：mysql -uroot -p < schema.sql
-- ============================================================
CREATE DATABASE IF NOT EXISTS pet_park DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pet_park;

-- 用户表（账号 + 积分 + 游戏存档，一用户一行）
CREATE TABLE IF NOT EXISTS users (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  username    VARCHAR(32)  NOT NULL UNIQUE COMMENT '用户名（登录账号，唯一）',
  password    VARCHAR(100) NOT NULL COMMENT '密码（BCrypt 哈希）',
  nickname    VARCHAR(32)  DEFAULT NULL COMMENT '昵称',
  education   VARCHAR(16)  NOT NULL DEFAULT 'PRIMARY_1' COMMENT '学历：PRIMARY_1..6 小学 / JUNIOR_1..3 初中 / SENIOR_1..3 高中 / UNIVERSITY_1..4 大学',
  role        VARCHAR(16)  NOT NULL DEFAULT 'user' COMMENT '角色：user 普通 / admin 管理员',
  coins       INT          NOT NULL DEFAULT 0 COMMENT '积分（独立字段，可查询/统计）',
  state_json  JSON         NULL COMMENT '游戏存档 JSON（菜地/宠物等动态状态）',
  version     INT          NOT NULL DEFAULT 7 COMMENT '存档版本号（对应前端）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（自动）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表（账号 + 积分 + 游戏存档，一用户一行）';

-- 事件日志（可选：把 state.logs 抽成行，便于统计/排行）
CREATE TABLE IF NOT EXISTS logs (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  user_id    BIGINT NOT NULL COMMENT '用户ID（关联 users.id）',
  type       VARCHAR(16)  NOT NULL COMMENT '日志类型：feed/play/harvest/watch/study/level...',
  text       VARCHAR(255) NOT NULL COMMENT '日志内容',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY idx_logs_user (user_id, created_at),
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='事件日志表（学习/喂食/收获等流水）';

-- ============================================================
-- 统一类目表（种植植物 / 养殖鱼 / 养殖动物 / 家具 ... 全部一张表）
-- type 字段区分大类；价格、成长时间、产出物等字段全在此
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  code        VARCHAR(32)  NOT NULL UNIQUE COMMENT '唯一标识：carrot/goldfish/chicken/bed',
  name        VARCHAR(32)  NOT NULL COMMENT '中文名',
  type        VARCHAR(16)  NOT NULL COMMENT '大类：crop 植物 / fish 鱼 / animal 动物 / furniture 家具',
  price       INT          NOT NULL DEFAULT 0 COMMENT '购买价（金币）',
  sell_price  INT          NOT NULL DEFAULT 0 COMMENT '成熟/产出后售价（金币）',
  grow_days   DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '成长所需天数',
  feed_days   DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '浇水/喂养间隔（天）',
  exp         INT          NOT NULL DEFAULT 0 COMMENT '收获/售卖所得经验',
  level_req   INT          NOT NULL DEFAULT 1 COMMENT '解锁所需等级',
  product     VARCHAR(32)  DEFAULT NULL COMMENT '产出物名称（动物：鸡蛋/鸭蛋/牛奶）',
  prod_price  INT          NOT NULL DEFAULT 0 COMMENT '产出物售价',
  satiety     INT          NOT NULL DEFAULT 0 COMMENT '作为宠物食物时的饱食增加值',
  energy      INT          NOT NULL DEFAULT 0 COMMENT '作为宠物食物时的体力增加值',
  color       VARCHAR(16)  NOT NULL DEFAULT '#FFFFFF' COMMENT '主题色（16进制）',
  icon_svg    TEXT         DEFAULT NULL COMMENT '可选：SVG 图标（不设则用 code 默认样式）',
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 启用 / 0 停用',
  sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序值（越小越靠前）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY idx_cat_type (type, status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一类目表（种植植物/养殖鱼/养殖动物/家具，全在一张表）';

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
  id          BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  subject     VARCHAR(16)  NOT NULL COMMENT '科目：english 英语 / math 数学 / hanzi 汉字 / chengyu 成语 / thinking 思维 / yuwen 语文',
  education   VARCHAR(16)  NOT NULL DEFAULT 'PRIMARY_1' COMMENT '学历：PRIMARY_1..6 / JUNIOR_1..3 / SENIOR_1..3 / UNIVERSITY_1..4',
  q_type      VARCHAR(16)  NOT NULL DEFAULT 'choice' COMMENT '题型：choice 单选 / match 配对 / fill 填空 / qa 问答 / card 卡片',
  group_id    VARCHAR(32)  DEFAULT NULL COMMENT '分组标识（animals/加法/反义词...）',
  group_name  VARCHAR(32)  DEFAULT NULL COMMENT '分组名称（展示用）',
  prompt      TEXT         NOT NULL COMMENT '题干（支持 JSON：图片/富文本）',
  options     JSON         DEFAULT NULL COMMENT '选择题选项 [{text, correct, icon}]',
  answer      TEXT         DEFAULT NULL COMMENT '正确答案（match 存映射 JSON / fill 存文本 / qa 存参考）',
  level       INT          NOT NULL DEFAULT 1 COMMENT '难度等级 1-5',
  points      INT          NOT NULL DEFAULT 1 COMMENT '答对所得金币',
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 启用 / 0 停用',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY idx_ques_subject (subject, status, level),
  -- ★ 唯一索引：防止重复执行初始化时题库翻倍（配合下方 ON DUPLICATE KEY UPDATE）
  UNIQUE KEY uk_ques_subject_group_prompt (subject, group_id, prompt(200))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学习题库表（兼容多科目 + 多题型 + 多学历）';

-- ★ 幂等保护：重新执行本脚本时，先清空题库种子表（不删 users/players/logs 业务数据）
DELETE FROM questions;

-- 题库初始数据（241 题：60 基础 + 65 扩展 + 116 一年级三科）
INSERT INTO questions (subject,q_type,group_id,group_name,prompt,options,answer,level,points) VALUES
('english','choice','animals','动物','cat 的意思是？','[{"text":"狗"},{"text":"猫","correct":true},{"text":"鸟"},{"text":"鱼"}]','猫',1,1),
('english','choice','animals','动物','dog 的意思是？','[{"text":"猫"},{"text":"鱼"},{"text":"狗","correct":true},{"text":"兔子"}]','狗',1,1),
('english','choice','animals','动物','bird 的意思是？','[{"text":"鸟","correct":true},{"text":"鱼"},{"text":"猫"},{"text":"牛"}]','鸟',1,1),
('english','choice','animals','动物','fish 的意思是？','[{"text":"鸟"},{"text":"鱼","correct":true},{"text":"狗"},{"text":"兔子"}]','鱼',1,1),
('english','choice','animals','动物','rabbit 的意思是？','[{"text":"猫"},{"text":"狗"},{"text":"兔子","correct":true},{"text":"老虎"}]','兔子',1,1),
('english','choice','fruits','水果','apple 的意思是？','[{"text":"苹果","correct":true},{"text":"香蕉"},{"text":"葡萄"},{"text":"西瓜"}]','苹果',1,1),
('english','choice','fruits','水果','banana 的意思是？','[{"text":"苹果"},{"text":"香蕉","correct":true},{"text":"橙子"},{"text":"草莓"}]','香蕉',1,1),
('english','choice','fruits','水果','grape 的意思是？','[{"text":"西瓜"},{"text":"橙子"},{"text":"葡萄","correct":true},{"text":"桃子"}]','葡萄',1,1),
('english','choice','fruits','水果','orange 的意思是？','[{"text":"苹果"},{"text":"葡萄"},{"text":"香蕉"},{"text":"橙子","correct":true}]','橙子',1,1),
('english','choice','fruits','水果','watermelon 的意思是？','[{"text":"西瓜","correct":true},{"text":"葡萄"},{"text":"苹果"},{"text":"梨"}]','西瓜',1,1),
('english','choice','colors','颜色','red 的意思是？','[{"text":"蓝色"},{"text":"红色","correct":true},{"text":"绿色"},{"text":"黄色"}]','红色',1,1),
('english','choice','colors','颜色','blue 的意思是？','[{"text":"红色"},{"text":"绿色"},{"text":"蓝色","correct":true},{"text":"粉色"}]','蓝色',1,1),
('english','choice','colors','颜色','green 的意思是？','[{"text":"黄色"},{"text":"绿色","correct":true},{"text":"红色"},{"text":"黑色"}]','绿色',1,1),
('english','choice','colors','颜色','yellow 的意思是？','[{"text":"粉色"},{"text":"蓝色"},{"text":"黄色","correct":true},{"text":"紫色"}]','黄色',1,1),
('english','choice','colors','颜色','pink 的意思是？','[{"text":"粉色","correct":true},{"text":"橙色"},{"text":"棕色"},{"text":"白色"}]','粉色',1,1),
('math','choice','add10','10以内加法','3 + 4 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
('math','choice','add10','10以内加法','2 + 5 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
('math','choice','add10','10以内加法','4 + 4 = ?','[{"text":"6"},{"text":"7"},{"text":"8","correct":true},{"text":"9"}]','8',1,2),
('math','choice','add10','10以内加法','1 + 9 = ?','[{"text":"8"},{"text":"9"},{"text":"10","correct":true},{"text":"11"}]','10',1,2),
('math','choice','add10','10以内加法','5 + 2 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
('math','choice','sub10','10以内减法','8 - 3 = ?','[{"text":"4"},{"text":"6"},{"text":"5","correct":true},{"text":"7"}]','5',1,2),
('math','choice','sub10','10以内减法','9 - 4 = ?','[{"text":"4"},{"text":"5","correct":true},{"text":"6"},{"text":"7"}]','5',1,2),
('math','choice','sub10','10以内减法','7 - 2 = ?','[{"text":"4"},{"text":"5","correct":true},{"text":"6"},{"text":"7"}]','5',1,2),
('math','choice','sub10','10以内减法','10 - 6 = ?','[{"text":"3"},{"text":"4","correct":true},{"text":"5"},{"text":"6"}]','4',1,2),
('math','choice','sub10','10以内减法','6 - 1 = ?','[{"text":"3"},{"text":"4"},{"text":"5","correct":true},{"text":"6"}]','5',1,2),
('math','fill','fill10','数字填空','5 + __ = 8','[]','3',1,2),
('math','fill','fill10','数字填空','__ + 2 = 9','[]','7',1,2),
('math','fill','fill10','数字填空','10 - __ = 4','[]','6',1,2),
('math','fill','fill10','数字填空','__ - 3 = 5','[]','8',1,2),
('math','fill','fill10','数字填空','4 + __ = 10','[]','6',1,2),
('hanzi','qa','basic','认一认','"日" 是什么？','[]','太阳。也指"天"，比如：今天、日子。',1,2),
('hanzi','qa','basic','认一认','"月" 是什么？','[]','月亮。也指月份，比如：一月、二月。',1,2),
('hanzi','qa','basic','认一认','"山" 是什么？','[]','山丘、高山。组词：大山、爬山。',1,2),
('hanzi','qa','basic','认一认','"水" 是什么？','[]','水。组词：喝水、水果、河水。',1,2),
('hanzi','qa','basic','认一认','"火" 是什么？','[]','火。组词：火车、火山、生火。',1,2),
('hanzi','choice','antonym','反义词','"大" 的反义词是？','[{"text":"小","correct":true},{"text":"高"},{"text":"多"}]','小',1,2),
('hanzi','choice','antonym','反义词','"上" 的反义词是？','[{"text":"前"},{"text":"下","correct":true},{"text":"左"}]','下',1,2),
('hanzi','choice','antonym','反义词','"冷" 的反义词是？','[{"text":"凉"},{"text":"冰"},{"text":"热","correct":true}]','热',1,2),
('hanzi','choice','antonym','反义词','"快" 的反义词是？','[{"text":"慢","correct":true},{"text":"飞"},{"text":"急"}]','慢',1,2),
('hanzi','choice','antonym','反义词','"开" 的反义词是？','[{"text":"关","correct":true},{"text":"启"},{"text":"放"}]','关',1,2),
('chengyu','choice','animal','动物成语','对牛弹琴中"牛"是什么？','[{"text":"哺乳动物","correct":true},{"text":"植物"},{"text":"石头"},{"text":"乐器"}]','哺乳动物',2,2),
('chengyu','choice','animal','动物成语','画蛇添足中"蛇"没有哪样东西？','[{"text":"脚","correct":true},{"text":"头"},{"text":"尾巴"},{"text":"身体"}]','脚',2,2),
('chengyu','choice','animal','动物成语','亡羊补牢指的是什么羊？','[{"text":"丢失的羊","correct":true},{"text":"跑得快的羊"},{"text":"白色的羊"},{"text":"小羊"}]','丢失的羊',2,2),
('chengyu','choice','animal','动物成语','守株待兔中农夫等的是什么？','[{"text":"兔子","correct":true},{"text":"老虎"},{"text":"狐狸"},{"text":"小鸟"}]','兔子',2,2),
('chengyu','choice','animal','动物成语','狐假虎威中谁借着老虎的威风？','[{"text":"狐狸","correct":true},{"text":"猴子"},{"text":"狼"},{"text":"狮子"}]','狐狸',2,2),
('chengyu','choice','common','常用成语','一心一意形容什么？','[{"text":"专心","correct":true},{"text":"害怕"},{"text":"开心"},{"text":"生气"}]','专心',2,2),
('chengyu','choice','common','常用成语','半途而废指做事怎么样？','[{"text":"坚持到底"},{"text":"做到一半放弃","correct":true},{"text":"很快完成"},{"text":"慢慢做"}]','做到一半放弃',2,2),
('chengyu','choice','common','常用成语','马到成功常用来祝福什么？','[{"text":"出行办事顺利","correct":true},{"text":"考试失败"},{"text":"生病"},{"text":"下雨"}]','出行办事顺利',2,2),
('chengyu','choice','common','常用成语','井底之蛙比喻什么？','[{"text":"见识短浅的人","correct":true},{"text":"很聪明的人"},{"text":"跳得高的人"},{"text":"爱干净的人"}]','见识短浅的人',2,2),
('chengyu','choice','common','常用成语','亡羊补牢告诉我们什么道理？','[{"text":"出了问题要及时补救","correct":true},{"text":"不要养羊"},{"text":"羊很危险"},{"text":"要睡懒觉"}]','出了问题要及时补救',2,2),
('thinking','choice','logic','逻辑推理','小明比小红高，小红比小刚高，谁最高？','[{"text":"小刚"},{"text":"小红"},{"text":"小明","correct":true},{"text":"一样高"}]','小明',2,3),
('thinking','choice','logic','逻辑推理','香蕉比苹果贵，苹果比梨贵，最便宜的是？','[{"text":"香蕉"},{"text":"苹果"},{"text":"梨","correct":true},{"text":"一样贵"}]','梨',2,3),
('thinking','choice','logic','逻辑推理','今天是星期二，再过 3 天是星期几？','[{"text":"星期三"},{"text":"星期四"},{"text":"星期五","correct":true},{"text":"星期六"}]','星期五',2,3),
('thinking','choice','logic','逻辑推理','哥哥今年 10 岁，弟弟比哥哥小 3 岁，弟弟几岁？','[{"text":"5岁"},{"text":"6岁"},{"text":"7岁","correct":true},{"text":"8岁"}]','7岁',2,3),
('thinking','choice','logic','逻辑推理','红球比蓝球大，蓝球比绿球大，最小的是？','[{"text":"红球"},{"text":"蓝球"},{"text":"绿球","correct":true},{"text":"一样大"}]','绿球',2,3),
('thinking','choice','series','找规律','1、3、5、7、__？','[{"text":"8"},{"text":"9","correct":true},{"text":"10"},{"text":"11"}]','9',2,3),
('thinking','choice','series','找规律','2、4、6、8、__？','[{"text":"9"},{"text":"10","correct":true},{"text":"11"},{"text":"12"}]','10',2,3),
('thinking','choice','series','找规律','10、8、6、4、__？','[{"text":"1"},{"text":"2","correct":true},{"text":"3"},{"text":"5"}]','2',2,3),
('thinking','choice','series','找规律','1、2、4、7、__？','[{"text":"9"},{"text":"10"},{"text":"11","correct":true},{"text":"12"}]','11',2,3),
('thinking','choice','series','找规律','5、10、15、20、__？','[{"text":"21"},{"text":"22"},{"text":"24"},{"text":"25","correct":true}]','25',2,3),
-- ===== v33 扩展题库（65 题） =====,
('math','choice','add10','10以内加法','6 + 3 = ?','[{"text":"8"},{"text":"9","correct":true},{"text":"10"},{"text":"11"}]','9',1,2),
('math','choice','add10','10以内加法','4 + 5 = ?','[{"text":"8"},{"text":"9","correct":true},{"text":"10"},{"text":"11"}]','9',1,2),
('math','choice','add10','10以内加法','7 + 2 = ?','[{"text":"8"},{"text":"9","correct":true},{"text":"10"},{"text":"11"}]','9',1,2),
('math','choice','add10','10以内加法','3 + 6 = ?','[{"text":"8"},{"text":"9","correct":true},{"text":"10"},{"text":"11"}]','9',1,2),
('math','choice','add10','10以内加法','2 + 8 = ?','[{"text":"8"},{"text":"9"},{"text":"10","correct":true},{"text":"11"}]','10',1,2),
('math','choice','sub10','10以内减法','9 - 2 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
('math','choice','sub10','10以内减法','8 - 5 = ?','[{"text":"2"},{"text":"3","correct":true},{"text":"4"},{"text":"5"}]','3',1,2),
('math','choice','sub10','10以内减法','7 - 4 = ?','[{"text":"2"},{"text":"3","correct":true},{"text":"4"},{"text":"5"}]','3',1,2),
('math','choice','sub10','10以内减法','10 - 3 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
('math','choice','sub10','10以内减法','5 - 2 = ?','[{"text":"2"},{"text":"3","correct":true},{"text":"4"},{"text":"5"}]','3',1,2),
('math','fill','fill10','数字填空','6 + __ = 9','[]','3',1,2),
('math','fill','fill10','数字填空','__ + 4 = 8','[]','4',1,2),
('math','fill','fill10','数字填空','9 - __ = 5','[]','4',1,2),
('math','fill','fill10','数字填空','__ - 2 = 6','[]','8',1,2),
('math','fill','fill10','数字填空','3 + __ = 7','[]','4',1,2),
('math','choice','mul10','乘法入门','2 × 3 = ?','[{"text":"5"},{"text":"6","correct":true},{"text":"7"},{"text":"8"}]','6',1,2),
('math','choice','mul10','乘法入门','2 × 4 = ?','[{"text":"6"},{"text":"7"},{"text":"8","correct":true},{"text":"9"}]','8',1,2),
('math','choice','mul10','乘法入门','3 × 3 = ?','[{"text":"6"},{"text":"8"},{"text":"9","correct":true},{"text":"10"}]','9',1,2),
('math','choice','mul10','乘法入门','2 × 2 = ?','[{"text":"3"},{"text":"4","correct":true},{"text":"5"},{"text":"6"}]','4',1,2),
('math','choice','mul10','乘法入门','4 × 2 = ?','[{"text":"6"},{"text":"7"},{"text":"8","correct":true},{"text":"9"}]','8',1,2),
('hanzi','qa','basic','认一认','「天」指什么？','[]','天空、天气。组词：白天、今天、天气。',1,2),
('hanzi','qa','basic','认一认','「地」指什么？','[]','大地、土地。组词：地面、地方。',1,2),
('hanzi','qa','basic','认一认','「花」指什么？','[]','花朵、开花。组词：花草、花园。',1,2),
('hanzi','qa','basic','认一认','「草」指什么？','[]','小草、青草。组词：草地、花草。',1,2),
('hanzi','qa','basic','认一认','「雨」指什么？','[]','下雨、雨水。组词：雨天、大雨。',1,2),
('hanzi','choice','liangci','量词','「一 __ 书」应该填什么？','[{"text":"本","correct":true},{"text":"只"},{"text":"条"},{"text":"个"}]','本',1,2),
('hanzi','choice','liangci','量词','「一 __ 猫」应该填什么？','[{"text":"本"},{"text":"只","correct":true},{"text":"条"},{"text":"个"}]','只',1,2),
('hanzi','choice','liangci','量词','「一 __ 鱼」应该填什么？','[{"text":"本"},{"text":"只"},{"text":"条","correct":true},{"text":"个"}]','条',1,2),
('hanzi','choice','liangci','量词','「一 __ 苹果」应该填什么？','[{"text":"本"},{"text":"只"},{"text":"条"},{"text":"个","correct":true}]','个',1,2),
('hanzi','choice','liangci','量词','「一 __ 树」应该填什么？','[{"text":"棵","correct":true},{"text":"只"},{"text":"条"},{"text":"个"}]','棵',1,2),
('hanzi','qa','nature','自然','「天」指什么？','[]','天空、天气。组词：白天、今天、天气。',1,2),
('hanzi','qa','nature','自然','「地」指什么？','[]','大地、土地。组词：地面、地方。',1,2),
('hanzi','qa','nature','自然','「花」指什么？','[]','花朵、开花。组词：花草、花园。',1,2),
('hanzi','qa','nature','自然','「草」指什么？','[]','小草、青草。组词：草地、花草。',1,2),
('hanzi','qa','nature','自然','「雨」指什么？','[]','下雨、雨水。组词：雨天、大雨。',1,2),
('chengyu','choice','animal','动物成语','「画龙点睛」比喻什么？','[{"text":"锦上添花","correct":true},{"text":"画蛇添足"},{"text":"半途而废"},{"text":"亡羊补牢"}]','锦上添花',2,2),
('chengyu','choice','animal','动物成语','「守株待兔」告诉我们什么道理？','[{"text":"不能靠运气","correct":true},{"text":"要勤奋"},{"text":"不能贪心"},{"text":"要团结"}]','不能靠运气',2,2),
('chengyu','choice','animal','动物成语','「狐假虎威」比喻什么？','[{"text":"借别人的威势吓人","correct":true},{"text":"很勇敢"},{"text":"很聪明"},{"text":"很善良"}]','借别人的威势吓人',2,2),
('chengyu','choice','animal','动物成语','「叶公好龙」形容什么？','[{"text":"表面喜欢其实害怕","correct":true},{"text":"真的喜欢"},{"text":"勇敢"},{"text":"诚实"}]','表面喜欢其实害怕',2,2),
('chengyu','choice','animal','动物成语','「掩耳盗铃」讽刺什么？','[{"text":"自欺欺人","correct":true},{"text":"很聪明"},{"text":"很小心"},{"text":"很勤劳"}]','自欺欺人',2,2),
('thinking','choice','logic','逻辑推理','早上太阳从哪边升起？','[{"text":"东","correct":true},{"text":"西"},{"text":"南"},{"text":"北"}]','东',2,3),
('thinking','choice','logic','逻辑推理','一年有几个月？','[{"text":"10"},{"text":"11"},{"text":"12","correct":true},{"text":"13"}]','12',2,3),
('thinking','choice','logic','逻辑推理','一周有几天？','[{"text":"5"},{"text":"6"},{"text":"7","correct":true},{"text":"8"}]','7',2,3),
('thinking','choice','logic','逻辑推理','一碗粥是热的还是凉的？','[{"text":"热的","correct":true},{"text":"凉的"},{"text":"冰的"},{"text":"没温度"}]','热的',2,3),
('thinking','choice','logic','逻辑推理','下雨天出门要带什么？','[{"text":"雨伞","correct":true},{"text":"被子"},{"text":"书本"},{"text":"玩具"}]','雨伞',2,3),
('thinking','choice','shape','图形规律','△△○△△○ 接下来是什么？','[{"text":"△","correct":true},{"text":"○"},{"text":"□"},{"text":"☆"}]','△',2,3),
('thinking','choice','shape','图形规律','□○□○ 接下来是什么？','[{"text":"□","correct":true},{"text":"○"},{"text":"△"},{"text":"☆"}]','□',2,3),
('thinking','choice','shape','图形规律','红红蓝红红蓝 接下来是什么？','[{"text":"红","correct":true},{"text":"蓝"},{"text":"绿"},{"text":"黄"}]','红',2,3),
('thinking','choice','shape','图形规律','1 2 1 2 接下来是什么？','[{"text":"1","correct":true},{"text":"2"},{"text":"3"},{"text":"4"}]','1',2,3),
('thinking','choice','shape','图形规律','大中小大中小 接下来是什么？','[{"text":"大","correct":true},{"text":"中"},{"text":"小"},{"text":"大中"}]','大',2,3),
('thinking','choice','life','生活常识','早上太阳从哪边升起？','[{"text":"东","correct":true},{"text":"西"},{"text":"南"},{"text":"北"}]','东',2,3),
('thinking','choice','life','生活常识','一年有几个月？','[{"text":"10"},{"text":"11"},{"text":"12","correct":true},{"text":"13"}]','12',2,3),
('thinking','choice','life','生活常识','一周有几天？','[{"text":"5"},{"text":"6"},{"text":"7","correct":true},{"text":"8"}]','7',2,3),
('thinking','choice','life','生活常识','一碗粥是热的还是凉的？','[{"text":"热的","correct":true},{"text":"凉的"},{"text":"冰的"},{"text":"没温度"}]','热的',2,3),
('thinking','choice','life','生活常识','下雨天出门要带什么？','[{"text":"雨伞","correct":true},{"text":"被子"},{"text":"书本"},{"text":"玩具"}]','雨伞',2,3),
('english','choice','family','家庭','father 的意思是？','[{"text":"爸爸","correct":true},{"text":"乌龟"},{"text":"帽子"},{"text":"椅子"}]','爸爸',1,1),
('english','choice','family','家庭','mother 的意思是？','[{"text":"妈妈","correct":true},{"text":"乌龟"},{"text":"帽子"},{"text":"椅子"}]','妈妈',1,1),
('english','choice','family','家庭','brother 的意思是？','[{"text":"哥哥/弟弟","correct":true},{"text":"乌龟"},{"text":"帽子"},{"text":"椅子"}]','哥哥/弟弟',1,1),
('english','choice','family','家庭','sister 的意思是？','[{"text":"姐姐/妹妹","correct":true},{"text":"乌龟"},{"text":"帽子"},{"text":"椅子"}]','姐姐/妹妹',1,1),
('english','choice','family','家庭','baby 的意思是？','[{"text":"宝宝","correct":true},{"text":"乌龟"},{"text":"帽子"},{"text":"椅子"}]','宝宝',1,1),
('english','choice','body','身体','eye 的意思是？','[{"text":"眼睛","correct":true},{"text":"书本"},{"text":"石头"},{"text":"云朵"}]','眼睛',1,1),
('english','choice','body','身体','ear 的意思是？','[{"text":"耳朵","correct":true},{"text":"书本"},{"text":"石头"},{"text":"云朵"}]','耳朵',1,1),
('english','choice','body','身体','nose 的意思是？','[{"text":"鼻子","correct":true},{"text":"书本"},{"text":"石头"},{"text":"云朵"}]','鼻子',1,1),
('english','choice','body','身体','hand 的意思是？','[{"text":"手","correct":true},{"text":"书本"},{"text":"石头"},{"text":"云朵"}]','手',1,1),
('english','choice','body','身体','foot 的意思是？','[{"text":"脚","correct":true},{"text":"书本"},{"text":"石头"},{"text":"云朵"}]','脚',1,1),
-- ===== 一年级三科题库（116 题：语文/数学/英语） =====,
('yuwen','choice','pinyin','练习 1：拼音基础（选择题）','下列哪个是声母？','[{"text": "a", "correct": false}, {"text": "o", "correct": false}, {"text": "b", "correct": true}, {"text": "e", "correct": false}]','b',1,2),
('yuwen','choice','pinyin','练习 1：拼音基础（选择题）','下列哪个是整体认读音节？','[{"text": "an", "correct": false}, {"text": "yi", "correct": true}, {"text": "en", "correct": false}, {"text": "in", "correct": false}]','yi',1,2),
('yuwen','choice','pinyin','练习 1：拼音基础（选择题）','\"bā\" 中，b 是','[{"text": "韵母", "correct": false}, {"text": "声母", "correct": true}, {"text": "声调", "correct": false}, {"text": "音节", "correct": false}]','声母',1,2),
('yuwen','choice','pinyin','练习 1：拼音基础（选择题）','韵母 \"ü\" 和谁相拼要去掉两点？','[{"text": "b", "correct": false}, {"text": "j", "correct": true}, {"text": "d", "correct": false}, {"text": "f", "correct": false}]','j',1,2),
('yuwen','choice','pinyin','练习 1：拼音基础（选择题）','\"ma\" 的正确读音是','[{"text": "妈", "correct": true}, {"text": "爸", "correct": false}, {"text": "哥", "correct": false}, {"text": "弟", "correct": false}]','妈',1,2),
('yuwen','fill','pinyin','练习 2：拼音基础（填空题）','声母有（ ）个。','[]','23',1,2),
('yuwen','fill','pinyin','练习 2：拼音基础（填空题）','单韵母有（ ）个：a o e i u （ ）。','[]','6、ü',1,2),
('yuwen','fill','pinyin','练习 2：拼音基础（填空题）','给\"天\"注音：（ ）','[]','tiān',1,2),
('yuwen','fill','pinyin','练习 2：拼音基础（填空题）','给\"山\"注音：（ ）','[]','shān',1,2),
('yuwen','fill','pinyin','练习 2：拼音基础（填空题）','\"guā\" 是三拼音节，声母是（ ），介母是（ ），韵母是（ ）。','[]','g、u、a',1,2),
('yuwen','fill','shizi','练习 3：识字（选择题）','\"日\"加一笔可以变成（ ）。 A. 田  B. 目  C. 白  D. 旦','[]','A（日加竖变田）',1,2),
('yuwen','choice','shizi','练习 3：识字（选择题）','\"大\"的反义词是','[{"text": "小", "correct": true}, {"text": "多", "correct": false}, {"text": "上", "correct": false}, {"text": "高", "correct": false}]','小',1,2),
('yuwen','choice','shizi','练习 3：识字（选择题）','\"水\"的第二笔是','[{"text": "横折", "correct": false}, {"text": "竖钩", "correct": true}, {"text": "横撇", "correct": false}, {"text": "点", "correct": false}]','竖钩',1,2),
('yuwen','choice','shizi','练习 3：识字（选择题）','下列哪个字是左右结构？','[{"text": "明", "correct": true}, {"text": "日", "correct": false}, {"text": "口", "correct": false}, {"text": "田", "correct": false}]','明',1,2),
('yuwen','choice','shizi','练习 3：识字（选择题）','\"木\"加一笔变成','[{"text": "本", "correct": true}, {"text": "林", "correct": false}, {"text": "森", "correct": false}, {"text": "禾", "correct": false}]','本',1,2),
('yuwen','fill','liangci','练习 4：量词（填空题）','一（ ）书','[]','本',1,2),
('yuwen','fill','liangci','练习 4：量词（填空题）','一（ ）猫','[]','只',1,2),
('yuwen','fill','liangci','练习 4：量词（填空题）','一（ ）鱼','[]','条',1,2),
('yuwen','fill','liangci','练习 4：量词（填空题）','一（ ）树','[]','棵',1,2),
('yuwen','fill','liangci','练习 4：量词（填空题）','一（ ）花','[]','朵',1,2),
('yuwen','choice','kewen','练习 5：课文理解（选择题）','《秋天》里，什么从树上落下来？','[{"text": "叶子", "correct": true}, {"text": "果子", "correct": false}, {"text": "花", "correct": false}, {"text": "雪", "correct": false}]','叶子',1,2),
('yuwen','choice','kewen','练习 5：课文理解（选择题）','《小小的船》里，\"小小的船\"指的是','[{"text": "月亮", "correct": true}, {"text": "太阳", "correct": false}, {"text": "星星", "correct": false}, {"text": "云朵", "correct": false}]','月亮',1,2),
('yuwen','fill','kewen','练习 5：课文理解（选择题）','《江南》里写的是（ ）很多。 A. 鱼  B. 鸟  C. 花  D. 树','[]','A',1,2),
('yuwen','fill','kewen','练习 5：课文理解（选择题）','《四季》中，秋天谷穗弯弯，是（ ）季。 A. 春  B. 夏  C. 秋  D. 冬','[]','C',1,2),
('yuwen','choice','kewen','练习 5：课文理解（选择题）','《咏鹅》的作者是','[{"text": "李白", "correct": false}, {"text": "骆宾王", "correct": true}, {"text": "杜甫", "correct": false}, {"text": "白居易", "correct": false}]','骆宾王',1,2),
('yuwen','fill','gushi','练习 6：古诗（填空题）','鹅，鹅，鹅，曲项向（ ）歌。','[]','天',1,2),
('yuwen','fill','gushi','练习 6：古诗（填空题）','白毛浮（ ），红掌拨清波。','[]','绿水',1,2),
('yuwen','fill','gushi','练习 6：古诗（填空题）','锄禾日当（ ），汗滴禾下土。','[]','午',1,2),
('yuwen','fill','gushi','练习 6：古诗（填空题）','谁知盘中餐，粒粒皆（ ）。','[]','辛苦',1,2),
('yuwen','fill','gushi','练习 6：古诗（填空题）','床前明（ ）光，疑是地上霜。','[]','月',1,2),
('math','choice','grade1','练习 1：1~5的认识（选择题）','3 和 2 合起来是','[{"text": "4", "correct": false}, {"text": "5", "correct": true}, {"text": "6", "correct": false}, {"text": "3", "correct": false}]','5',1,2),
('math','choice','grade1','练习 1：1~5的认识（选择题）','比 4 多 1 的数是','[{"text": "3", "correct": false}, {"text": "4", "correct": false}, {"text": "5", "correct": true}, {"text": "6", "correct": false}]','5',1,2),
('math','choice','grade1','练习 1：1~5的认识（选择题）','5 可以分成 2 和','[{"text": "1", "correct": false}, {"text": "2", "correct": false}, {"text": "3", "correct": true}, {"text": "4", "correct": false}]','3',1,2),
('math','choice','grade1','练习 1：1~5的认识（选择题）','0 表示','[{"text": "没有", "correct": true}, {"text": "一个", "correct": false}, {"text": "十个", "correct": false}, {"text": "一百", "correct": false}]','没有',1,2),
('math','choice','grade1','练习 1：1~5的认识（选择题）','1 + 3 =','[{"text": "3", "correct": false}, {"text": "4", "correct": true}, {"text": "5", "correct": false}, {"text": "2", "correct": false}]','4',1,2),
('math','fill','grade1','练习 2：1~5的加减法（填空题）','2 + 2 =（ ）','[]','4',1,2),
('math','fill','grade1','练习 2：1~5的加减法（填空题）','5 - 3 =（ ）','[]','2',1,2),
('math','fill','grade1','练习 2：1~5的加减法（填空题）','4 - 4 =（ ）','[]','0',1,2),
('math','fill','grade1','练习 2：1~5的加减法（填空题）','3 + 0 =（ ）','[]','3',1,2),
('math','fill','grade1','练习 2：1~5的加减法（填空题）','（ ）+ 1 = 5','[]','4',1,2),
('math','choice','grade1','练习 3：6~10的加减法（选择题）','7 + 3 =','[{"text": "9", "correct": false}, {"text": "10", "correct": true}, {"text": "8", "correct": false}, {"text": "11", "correct": false}]','10',1,2),
('math','choice','grade1','练习 3：6~10的加减法（选择题）','9 - 4 =','[{"text": "5", "correct": true}, {"text": "4", "correct": false}, {"text": "6", "correct": false}, {"text": "3", "correct": false}]','5',1,2),
('math','choice','grade1','练习 3：6~10的加减法（选择题）','10 可以分成 4 和','[{"text": "5", "correct": false}, {"text": "6", "correct": true}, {"text": "7", "correct": false}, {"text": "8", "correct": false}]','6',1,2),
('math','choice','grade1','练习 3：6~10的加减法（选择题）','2 + 3 + 4 =','[{"text": "7", "correct": false}, {"text": "8", "correct": false}, {"text": "9", "correct": true}, {"text": "10", "correct": false}]','9',1,2),
('math','choice','grade1','练习 3：6~10的加减法（选择题）','10 - 3 - 2 =','[{"text": "4", "correct": false}, {"text": "5", "correct": true}, {"text": "6", "correct": false}, {"text": "7", "correct": false}]','5',1,2),
('math','fill','position','练习 4：位置（选择题）','我们写字用的手通常是（ ）手。 A. 左  B. 右','[]','B',1,2),
('math','fill','position','练习 4：位置（选择题）','太阳从（ ）边升起。 A. 东  B. 西  C. 南  D. 北','[]','A',1,2),
('math','fill','position','练习 4：位置（选择题）','上楼时，楼梯在（ ）面。 A. 前  B. 后','[]','A',1,2),
('math','fill','grade1','练习 5：11~20各数（填空题）','15 里面有（ ）个十和（ ）个一。','[]','1、5',1,2),
('math','fill','grade1','练习 5：11~20各数（填空题）','20 里面有（ ）个十。','[]','2',1,2),
('math','fill','grade1','练习 5：11~20各数（填空题）','个位是 3，十位是 1，这个数是（ ）。','[]','13',1,2),
('math','fill','grade1','练习 5：11~20各数（填空题）','比 19 多 1 的数是（ ）。','[]','20',1,2),
('math','fill','grade1','练习 5：11~20各数（填空题）','17 读作（ ）。','[]','十七',1,2),
('math','fill','carry','练习 6：20以内进位加法（凑十法）','9 + 4 =（ ） 想：9+（ ）=10，10+（ ）=13','[]','13、1、3',1,2),
('math','fill','carry','练习 6：20以内进位加法（凑十法）','8 + 6 =（ ）','[]','14',1,2),
('math','fill','carry','练习 6：20以内进位加法（凑十法）','7 + 5 =（ ）','[]','12',1,2),
('math','fill','carry','练习 6：20以内进位加法（凑十法）','6 + 9 =（ ）','[]','15',1,2),
('math','fill','carry','练习 6：20以内进位加法（凑十法）','5 + 8 =（ ）','[]','13',1,2),
('math','fill','clock','练习 7：认识钟表','时针指向 3，分针指向 12，是（ ）时。','[]','3',1,2),
('math','fill','clock','练习 7：认识钟表','6 时整，时针指向（ ），分针指向（ ）。','[]','6、12',1,2),
('math','fill','clock','练习 7：认识钟表','分针指向 12，时针指向 9，是（ ）时。','[]','9',1,2),
('math','fill','borrow','练习 8：20以内退位减法（下册）','15 - 8 =（ ） 想：10-8=2，2+5=（ ）','[]','7',1,2),
('math','fill','borrow','练习 8：20以内退位减法（下册）','12 - 5 =（ ）','[]','7',1,2),
('math','fill','borrow','练习 8：20以内退位减法（下册）','11 - 4 =（ ）','[]','7',1,2),
('math','fill','borrow','练习 8：20以内退位减法（下册）','16 - 9 =（ ）','[]','7',1,2),
('math','fill','borrow','练习 8：20以内退位减法（下册）','13 - 6 =（ ）','[]','7',1,2),
('math','fill','money','练习 9：认识人民币','1 元 =（ ）角','[]','10',1,2),
('math','fill','money','练习 9：认识人民币','1 角 =（ ）分','[]','10',1,2),
('math','fill','money','练习 9：认识人民币','5 元 3 角 =（ ）角','[]','53',1,2),
('math','fill','money','练习 9：认识人民币','1 张 10 元可以换（ ）张 5 元','[]','2',1,2),
('math','fill','money','练习 9：认识人民币','买一支铅笔 2 角，付 5 角应找回（ ）角','[]','3',1,2),
('math','fill','patterns','练习 10：找规律','1、3、5、7、（ ）','[]','9',1,2),
('math','fill','patterns','练习 10：找规律','2、4、6、8、（ ）','[]','10',1,2),
('math','fill','patterns','练习 10：找规律','△△○△△○、（ ）','[]','△',1,2),
('math','fill','patterns','练习 10：找规律','10、8、6、4、（ ）','[]','2',1,2),
('math','fill','patterns','练习 10：找规律','5、10、15、20、（ ）','[]','25',1,2),
('english','choice','greetings','练习 1：问候语（选择题）','早上见到老师应该说：','[{"text": "Good morning!", "correct": true}, {"text": "Good night!", "correct": false}, {"text": "Goodbye!", "correct": false}]','Good morning!',1,1),
('english','choice','greetings','练习 1：问候语（选择题）','\"How are you?\" 的回答是：','[{"text": "I''m fine.", "correct": true}, {"text": "Hello!", "correct": false}]','I''m fine.',1,1),
('english','choice','greetings','练习 1：问候语（选择题）','晚上睡觉前对妈妈说：','[{"text": "Good morning!", "correct": false}, {"text": "Good night!", "correct": true}, {"text": "Hi!", "correct": false}]','Good night!',1,1),
('english','choice','greetings','练习 1：问候语（选择题）','和朋友道别说：','[{"text": "Goodbye!", "correct": true}, {"text": "Hello!", "correct": false}, {"text": "Thank you!", "correct": false}]','Goodbye!',1,1),
('english','choice','greetings','练习 1：问候语（选择题）','\"Thank you\" 的中文是：','[{"text": "再见", "correct": false}, {"text": "谢谢", "correct": true}, {"text": "你好", "correct": false}]','谢谢',1,1),
('english','choice','numbers','练习 2：数字（选择题）','\"three\" 是数字','[{"text": "1", "correct": false}, {"text": "2", "correct": false}, {"text": "3", "correct": true}, {"text": "4", "correct": false}]','3',1,1),
('english','choice','numbers','练习 2：数字（选择题）','\"seven\" 是数字','[{"text": "5", "correct": false}, {"text": "6", "correct": false}, {"text": "7", "correct": true}, {"text": "8", "correct": false}]','7',1,1),
('english','choice','numbers','练习 2：数字（选择题）','数字 5 的英文是','[{"text": "four", "correct": false}, {"text": "five", "correct": true}, {"text": "six", "correct": false}, {"text": "seven", "correct": false}]','five',1,1),
('english','choice','numbers','练习 2：数字（选择题）','\"ten\" 是数字','[{"text": "8", "correct": false}, {"text": "9", "correct": false}, {"text": "10", "correct": true}, {"text": "11", "correct": false}]','10',1,1),
('english','choice','numbers','练习 2：数字（选择题）','one + two =','[{"text": "three", "correct": true}, {"text": "four", "correct": false}, {"text": "five", "correct": false}, {"text": "six", "correct": false}]','three',1,1),
('english','fill','colors','练习 3：颜色（选择题）','苹果通常是（ ）色。 A. red  B. blue  C. green  D. black','[]','A',1,1),
('english','fill','colors','练习 3：颜色（选择题）','天空是（ ）色。 A. yellow  B. blue  C. red  D. white','[]','B',1,1),
('english','choice','colors','练习 3：颜色（选择题）','\"yellow\" 的中文是','[{"text": "蓝色", "correct": false}, {"text": "绿色", "correct": false}, {"text": "黄色", "correct": true}, {"text": "红色", "correct": false}]','黄色',1,1),
('english','fill','colors','练习 3：颜色（选择题）','草是（ ）色。 A. green  B. pink  C. black  D. orange','[]','A',1,1),
('english','fill','colors','练习 3：颜色（选择题）','\"What color is it? — It''s ____.\" 回答苹果是红色：A. red  B. blue  C. green','[]','A',1,1),
('english','choice','animals','练习 4：动物（选择题）','\"cat\" 的中文是','[{"text": "狗", "correct": false}, {"text": "猫", "correct": true}, {"text": "鸟", "correct": false}, {"text": "鱼", "correct": false}]','猫',1,1),
('english','choice','animals','练习 4：动物（选择题）','会 \"喵喵\" 叫的动物是','[{"text": "dog", "correct": false}, {"text": "cat", "correct": true}, {"text": "bird", "correct": false}, {"text": "cow", "correct": false}]','cat',1,1),
('english','choice','animals','练习 4：动物（选择题）','\"duck\" 的中文是','[{"text": "鸡", "correct": false}, {"text": "鸭", "correct": true}, {"text": "牛", "correct": false}, {"text": "猪", "correct": false}]','鸭',1,1),
('english','choice','animals','练习 4：动物（选择题）','奶牛产奶，它的英文是','[{"text": "cow", "correct": true}, {"text": "pig", "correct": false}, {"text": "monkey", "correct": false}, {"text": "tiger", "correct": false}]','cow',1,1),
('english','fill','animals','练习 4：动物（选择题）','\"What''s this? — It''s a ____.\" 兔子：A. rabbit  B. dog  C. fish','[]','A',1,1),
('english','choice','fruits','练习 5：水果（选择题）','\"apple\" 的中文是','[{"text": "香蕉", "correct": false}, {"text": "苹果", "correct": true}, {"text": "梨", "correct": false}, {"text": "葡萄", "correct": false}]','苹果',1,1),
('english','choice','fruits','练习 5：水果（选择题）','黄色的长条形水果是','[{"text": "banana", "correct": true}, {"text": "apple", "correct": false}, {"text": "pear", "correct": false}, {"text": "peach", "correct": false}]','banana',1,1),
('english','choice','fruits','练习 5：水果（选择题）','\"orange\" 的中文是','[{"text": "橙子", "correct": true}, {"text": "西瓜", "correct": false}, {"text": "草莓", "correct": false}, {"text": "桃", "correct": false}]','橙子',1,1),
('english','choice','fruits','练习 5：水果（选择题）','夏天最大的水果是','[{"text": "watermelon", "correct": true}, {"text": "grape", "correct": false}, {"text": "apple", "correct": false}, {"text": "banana", "correct": false}]','watermelon',1,1),
('english','fill','fruits','练习 5：水果（选择题）','\"I like ____.\" 我喜欢苹果：A. apple  B. apples  C. apple''s','[]','B',1,1),
('english','choice','family','练习 6：家庭（选择题）','\"father\" 的中文是','[{"text": "妈妈", "correct": false}, {"text": "爸爸", "correct": true}, {"text": "哥哥", "correct": false}, {"text": "爷爷", "correct": false}]','爸爸',1,1),
('english','choice','family','练习 6：家庭（选择题）','\"mother\" 的中文是','[{"text": "爸爸", "correct": false}, {"text": "妈妈", "correct": true}, {"text": "姐姐", "correct": false}, {"text": "奶奶", "correct": false}]','妈妈',1,1),
('english','fill','family','练习 6：家庭（选择题）','\"This is my ____.\" 这是我妹妹：A. sister  B. brother  C. father','[]','A',1,1),
('english','choice','family','练习 6：家庭（选择题）','爷爷的英文是','[{"text": "grandma", "correct": false}, {"text": "grandpa", "correct": true}, {"text": "baby", "correct": false}, {"text": "mother", "correct": false}]','grandpa',1,1),
('english','choice','family','练习 6：家庭（选择题）','\"brother\" 的意思是','[{"text": "姐妹", "correct": false}, {"text": "兄弟", "correct": true}, {"text": "父母", "correct": false}, {"text": "宝宝", "correct": false}]','兄弟',1,1),
('english','fill','body','练习 7：身体（选择题）','我们用（ ）看东西。 A. eye  B. ear  C. nose  D. mouth','[]','A',1,1),
('english','fill','body','练习 7：身体（选择题）','我们用（ ）听声音。 A. eye  B. ear  C. hand  D. foot','[]','B',1,1),
('english','choice','body','练习 7：身体（选择题）','\"nose\" 的中文是','[{"text": "眼睛", "correct": false}, {"text": "耳朵", "correct": false}, {"text": "鼻子", "correct": true}, {"text": "嘴巴", "correct": false}]','鼻子',1,1),
('english','choice','body','练习 7：身体（选择题）','拍手用','[{"text": "hand", "correct": true}, {"text": "foot", "correct": false}, {"text": "head", "correct": false}, {"text": "face", "correct": false}]','hand',1,1),
('english','fill','body','练习 7：身体（选择题）','\"Touch your ____.\" 摸你的头：A. head  B. foot  C. eye','[]','A',1,1),
('english','fill','grade1','练习 8：综合句型（填空题）','What''s this? — It''s a（ ）.(猫)','[]','cat',1,1),
('english','fill','grade1','练习 8：综合句型（填空题）','How many apples? —（ ）.(五个)','[]','five',1,1),
('english','fill','grade1','练习 8：综合句型（填空题）','What color is the sky? — It''s（ ）.(蓝色)','[]','blue',1,1),
('english','fill','grade1','练习 8：综合句型（填空题）','This is my（ ）.(妈妈)','[]','mother',1,1),
('english','fill','grade1','练习 8：综合句型（填空题）','I like（ ）.(香蕉)','[]','bananas',1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- ============================================================
-- 错题本（AI 答疑 + 查缺补漏）
-- 答题错误时前端调 /api/study/explain → 后端调 AI 解答并判定缺失知识点
-- ============================================================
CREATE TABLE IF NOT EXISTS question_failures (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  user_id      BIGINT       NOT NULL COMMENT '用户ID',
  question_id  BIGINT       NOT NULL COMMENT '题目ID（questions.id）',
  prompt       TEXT         NOT NULL COMMENT '题目题干快照',
  user_answer  TEXT         NULL COMMENT '用户答错的答案',
  ai_explain   TEXT         NULL COMMENT 'AI 答疑内容',
  weak_points  VARCHAR(255) NULL COMMENT '缺失知识点（逗号分隔）',
  status       TINYINT      NOT NULL DEFAULT 0 COMMENT '状态：0 待学习 / 1 已掌握',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_fail_user (user_id, status, created_at),
  KEY idx_fail_ques (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ★★★ 大世界模块表（M1 追加，设计 03-db-schema.md）
-- 兼容 MySQL 5.7/8，幂等可重复执行；不使用 Flyway（项目约定 schema.sql 初始化）
-- 注意：users 扩展字段用 information_schema 守卫的 ALTER（5.7 无 ADD COLUMN IF NOT EXISTS）
-- ============================================================

-- ------------------------------------------------------------
-- 世界配置表（全局一行：种子/版本/边界/生成参数，ADR-W3 数据驱动）
-- 任意生成参数/种子变更必须 version+1，否则新旧 chunk 视觉接缝
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_config (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID（恒为1）',
  seed          VARCHAR(32)  NOT NULL DEFAULT 'dudu2019' COMMENT '世界种子（改种子=新世界）',
  version       INT          NOT NULL DEFAULT 1 COMMENT '世界版本（改种子/地形参数时+1，客户端重载依据；ADR-W3 不变量）',
  chunk_size    INT          NOT NULL DEFAULT 64 COMMENT 'chunk 边长（世界格）',
  world_radius  INT          NOT NULL DEFAULT 1024 COMMENT '世界半径（chunk 数，0=无限）',
  water_level   DECIMAL(6,2) NOT NULL DEFAULT -2.00 COMMENT '水位线（h<此值=水；M1 落地调参：噪声幅值 ~±1.9，默认0.00 会全海）',
  tree_density  DECIMAL(4,2) NOT NULL DEFAULT 0.02 COMMENT '草地区树木密度（0-1）',
  scale         DECIMAL(8,5) NOT NULL DEFAULT 0.00400 COMMENT 'fbm 基础频率',
  octaves       INT          NOT NULL DEFAULT 4 COMMENT 'fbm 倍频',
  lacunarity    DECIMAL(6,3) NOT NULL DEFAULT 2.000 COMMENT 'fbm 频率倍增',
  gain          DECIMAL(6,3) NOT NULL DEFAULT 0.500 COMMENT 'fbm 振幅衰减',
  slope_walk    DECIMAL(5,2) NOT NULL DEFAULT 35.00 COMMENT 'walkable 坡度阈值（°）',
  slope_build   DECIMAL(5,2) NOT NULL DEFAULT 15.00 COMMENT 'buildable 坡度阈值（°）',
  ore_density   DECIMAL(4,2) NOT NULL DEFAULT 0.03 COMMENT 'mountain 区矿脉密度（0-1）',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界配置表（种子/版本/边界/生成参数，全局一行）';

-- 幂等保护：仅当表空时插入默认行
INSERT INTO world_config (id, seed) VALUES (1, 'dudu2019')
ON DUPLICATE KEY UPDATE id = id;

-- ------------------------------------------------------------
-- 世界 chunk 缓存表（可选：首次生成后落库，重启免重算）
-- M1 仅预留表结构；height 65×65 float32 / semantic 64×64 byte 原始字节
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_chunks (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key     VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz（如 12_8）',
  cx            INT          NOT NULL COMMENT 'chunk X 坐标',
  cz            INT          NOT NULL COMMENT 'chunk Z 坐标',
  height_blob   LONGBLOB     NOT NULL COMMENT '65×65 高度 float32 原始字节（4225×4B）',
  semantic_blob LONGBLOB     NOT NULL COMMENT '64×64 语义 byte 原始字节（4096B）',
  version       INT          NOT NULL DEFAULT 1 COMMENT '世界版本（缓存失效依据）',
  gen_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生成时间',
  UNIQUE KEY uk_chunk_key (chunk_key, version),
  KEY idx_chunk_xy (cx, cz)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界 chunk 缓存表（地形生成结果缓存，可清理）';

-- ------------------------------------------------------------
-- 世界对象表（核心：玩家建筑/鱼塘/资源点；只存玩家改动）
-- uk_chunk_cell 唯一键支撑条件 INSERT 防双置（ADR-W4）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_objects (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz（查询索引）',
  gx          INT          NOT NULL COMMENT '世界格 X（1格=1单位）',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  type        VARCHAR(32)  NOT NULL COMMENT '对象类型：wood_house/stone_house/fish_pond...（关联 categories.code）',
  owner_id    BIGINT       NOT NULL COMMENT '所有者用户ID（关联 users.id）',
  rot         DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '朝向（弧度）',
  ext_json    JSON         DEFAULT NULL COMMENT '附加状态：{fishType, fishCount, level, growDays...}',
  state       TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 正常 / 0 拆除（软删，保留记录）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_chunk_cell (chunk_key, gx, gz, state),
  KEY idx_chunk_owner (chunk_key, owner_id),
  KEY idx_owner (owner_id, created_at),
  CONSTRAINT fk_wobj_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界对象表（玩家建筑/鱼塘/资源点，只存玩家改动）';

-- ------------------------------------------------------------
-- 地形修改表（挖/填/伐木/挖矿等玩家对地形的改动；M1 预留表结构）
-- 挖矿（M4）：old_type='ore_*', new_type='empty'；定时任务删记录 → 矿脉再生
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS terrain_mods (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz',
  gx          INT          NOT NULL COMMENT '世界格 X',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  old_type    VARCHAR(16)  NOT NULL COMMENT '原语义类型',
  new_type    VARCHAR(16)  NOT NULL COMMENT '新语义类型',
  by_player   BIGINT       NOT NULL COMMENT '操作玩家（关联 users.id）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  UNIQUE KEY uk_cell (chunk_key, gx, gz),
  KEY idx_mod_owner (by_player, created_at),
  KEY idx_regen (new_type, created_at),
  KEY idx_regen2 (old_type, new_type, created_at),
  CONSTRAINT fk_tmod_player FOREIGN KEY (by_player) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地形修改表（玩家对地形的改动，与生成地形叠加）';

-- ------------------------------------------------------------
-- 世界背包表（M1 预留空表：玩家世界采集物，M4 采矿使用）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_inventory (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid         BIGINT       NOT NULL COMMENT '玩家（关联 users.id）',
  item_type   VARCHAR(32)  NOT NULL COMMENT '物品类型（=categories.code，如 coal_ore/iron_ore/gold_ore）',
  qty         INT          NOT NULL DEFAULT 0 COMMENT '数量',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_owner_item (uid, item_type),
  KEY idx_owner (uid, created_at),
  CONSTRAINT fk_winv_owner FOREIGN KEY (uid) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界背包表（玩家世界采集物，M4 出售换积分）';

-- ------------------------------------------------------------
-- 世界宠物表（M1 预留空表：玩家成熟动物牵入世界的跟随宠物，B3 桥接）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_pets (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid         BIGINT       NOT NULL COMMENT '主人（关联 users.id）',
  species     VARCHAR(32)  NOT NULL COMMENT '物种（cat/dog/cow/chicken/duck/sheep/fish…）',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT '所在 chunk（查询索引）',
  gx          INT          NOT NULL COMMENT '世界格 X',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  rot         DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '朝向（弧度）',
  state       TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 跟随/游荡 / 0 收回 home',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_chunk (chunk_key),
  KEY idx_owner (uid, created_at),
  CONSTRAINT fk_wpet_owner FOREIGN KEY (uid) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界宠物表（玩家成熟动物牵入世界的跟随宠物，无物理）';

-- ------------------------------------------------------------
-- users 表追加：大世界位置 + 采矿三系统（B2 预留；03 §4.1）
-- 5.7 兼容：information_schema 守卫，重复执行不报错
-- ------------------------------------------------------------
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='pos_x');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN pos_x INT DEFAULT NULL COMMENT ''玩家当前位置 X（世界格）'' AFTER version', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='pos_z');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN pos_z INT DEFAULT NULL COMMENT ''玩家当前位置 Z（世界格）'' AFTER pos_x', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='pos_y');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN pos_y DECIMAL(6,2) DEFAULT NULL COMMENT ''玩家当前高度 Y'' AFTER pos_z', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='last_chunk');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN last_chunk VARCHAR(24) DEFAULT NULL COMMENT ''玩家所在 chunk_key（区域订阅）'' AFTER pos_y', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='energy');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN energy INT NOT NULL DEFAULT 100 COMMENT ''采矿能量（当前值；与 categories.energy 动物饲料能量互不相干）'' AFTER last_chunk', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='level');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN level INT NOT NULL DEFAULT 1 COMMENT ''世界等级（B2 采矿）'' AFTER energy', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='experience');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN experience BIGINT NOT NULL DEFAULT 0 COMMENT ''世界经验（累积，B2 采矿）'' AFTER level', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='energy_updated_at');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN energy_updated_at DATETIME DEFAULT NULL COMMENT ''采矿能量最后再生时间戳（懒再生基准）'' AFTER experience', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- 🔴 补丁：gender 列在 User 实体/LoginResp 中已引用，但此前 CREATE TABLE 与所有 ALTER 均未包含，
--   导致每次登录 SELECT ... gender ... 报 Unknown column 'gender' → 500，登录全挂。
--   此处补幂等 ALTER（2026-08-18 修复登录 500，与移动速度修复同期发现）。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='gender');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN gender VARCHAR(8) DEFAULT NULL COMMENT ''性别：M 男 / F 女（决定玩家使用男孩/女孩建模）'' AFTER education', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------
-- categories 追加：大世界建筑/鱼塘设施 + 矿石种子（03 §4.2；type 已为 VARCHAR，无需 ALTER）
-- 矿石 code 必须与 CellType.typeName() 对齐：ore_coal / ore_iron / ore_gold（M4 采矿，WorldMiningService 按 t.typeName() 查 categories）
-- ------------------------------------------------------------
INSERT INTO categories (code,name,type,price,sell_price,grow_days,feed_days,exp,level_req,product,prod_price,satiety,energy,color,sort_order) VALUES
 ('wood_house','木屋','building',100,0,0,0,0,1,NULL,0,0,0,'#C98A4B',50),
 ('stone_house','石屋','building',300,0,0,0,0,2,NULL,0,0,0,'#8A8A7A',51),
 ('small_pond','小池塘','pond',50,0,0,0,0,1,NULL,0,0,0,'#2F7FD6',60),
 ('ore_coal','煤矿','resource',0,5,0,0,10,1,NULL,0,0,0,'#3A3A3A',70),
 ('ore_iron','铁矿','resource',0,12,0,0,16,1,NULL,0,0,0,'#B0B0B0',71),
 ('ore_gold','金矿','resource',0,30,0,0,25,2,NULL,0,0,0,'#FFD700',72)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ------------------------------------------------------------
-- ★★★ M2 追加：世界物理快照表（ADR-W7 候选②：服务端权威物理 · 崩溃续跑）
-- physics-service（Node Rapier WASM）world.takeSnapshot() 二进制 → 本表 BLOB
-- 低频覆盖写（5s / 事件），保留最近快照即可；启动/重启 restoreSnapshot() 续跑（tick 号对齐）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_physics_snapshot (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT '世界分片标识（当前单服恒为 global；预留分片扩容）',
  tick        BIGINT       NOT NULL COMMENT '物理 tick 号（固定步进计数，恢复时对齐）',
  snapshot    LONGBLOB     NOT NULL COMMENT 'Rapier takeSnapshot() 二进制（Uint8Array）',
  body_count  INT          NOT NULL DEFAULT 0 COMMENT '快照内刚体数（诊断/校验）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_phys_snapshot (chunk_key, tick),
  KEY idx_phys_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界物理快照表（physics-service 崩溃恢复，ADR-W7 候选②）';


