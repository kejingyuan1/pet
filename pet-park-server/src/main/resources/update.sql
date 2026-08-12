-- ============================================================
-- 宠物乐园 · 题库增量更新脚本（UPDATE.SQL）
-- 用途：在已运行的数据库上【新增】题库，不影响已有数据
--
-- 适用版本：v32（60题）→ v35（241题）增量升级
-- 新增内容：
--   ① v33 扩展题库：65 题（数学乘法入门/汉字量词自然/思维图形规律生活常识/英语家庭身体等）
--   ② 一年级三科题库：116 题（语文 yuwen / 数学 math / 英语 english）
--
-- 幂等性说明：
--   questions 表有唯一索引 uk_ques_subject_group_prompt (subject, group_id, prompt(200))
--   配合下方 ON DUPLICATE KEY UPDATE：重复执行本脚本【不会】产生重复题目
--
-- 执行方式：
--   mysql -uroot -p < update.sql
--   或进入 mysql 后：source update.sql
-- ============================================================

-- 使用正确的数据库
USE pet_park;

-- ★ 保障：确保 questions 表存在唯一索引（防止重复执行时翻倍）
--   若旧库表结构缺该索引，则补建（信息架构表判断，MySQL 5.7+ 兼容）
SET @idx_ok = (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE table_schema='pet_park' AND table_name='questions'
                 AND index_name='uk_ques_subject_group_prompt');
SET @ddl = IF(@idx_ok = 0,
  'ALTER TABLE questions ADD UNIQUE KEY uk_ques_subject_group_prompt (subject, group_id, prompt(200))',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- 增量插入题库（181 题）
INSERT INTO questions (subject,q_type,group_id,group_name,prompt,options,answer,level,points) VALUES
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
-- ===== 一年级三科题库（116 题） =====
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
-- ★ v39 表结构迁移：合并 players 表进 users（删除冗余表）
-- 背景：原 players 表（user_id + state_json）与 users 表 1:1 冗余，
--       且积分存在 JSON 里无法查询。现改为 users 直接持有
--       coins（积分独立字段）+ state_json（存档）——一张表搞定。
--
-- 幂等性：重复执行安全（加列用 information_schema 判断）
-- ============================================================

-- 1. users 加 coins 列（积分独立字段）
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE table_schema='pet_park' AND table_name='users' AND column_name='coins');
SET @s = IF(@c = 0, 'ALTER TABLE users ADD COLUMN coins INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2. users 加 state_json / version / updated_at（存档相关列）
SET @c2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE table_schema='pet_park' AND table_name='users' AND column_name='state_json');
SET @s2 = IF(@c2 = 0,
  'ALTER TABLE users ADD COLUMN state_json JSON NULL,
                     ADD COLUMN version INT NOT NULL DEFAULT 7,
                     ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 3. 若仍存在 players 表：把存档搬进 users，再删表
SET @p = (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE table_schema='pet_park' AND table_name='players');
SET @s3 = IF(@p > 0,
  'UPDATE users u JOIN players p ON u.id = p.user_id
     SET u.state_json = p.state_json, u.version = p.version,
         u.updated_at = p.updated_at, u.coins = 0',
  'SELECT 1');
PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- 3.2 搬完删掉 players 表
SET @s4 = IF(@p > 0, 'DROP TABLE players', 'SELECT 1');
PREPARE st4 FROM @s4; EXECUTE st4; DEALLOCATE PREPARE st4;

-- 4. 从已存 state_json 反写 coins（老用户积分迁移；无存档的保持 0）
UPDATE users
   SET coins = IF(state_json IS NOT NULL
                   AND JSON_VALID(state_json) = 1
                   AND JSON_EXTRACT(state_json, '$.coins') IS NOT NULL
                   AND JSON_EXTRACT(state_json, '$.coins') > 0,
                  CAST(JSON_EXTRACT(state_json, '$.coins') AS SIGNED), 0)
 WHERE coins = 0;

-- ============================================================
-- ★ v40 新增：users 表加 role 字段（用户角色，管理员管理用）
-- 幂等：列不存在才加
-- ============================================================
SET @r = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE table_schema='pet_park' AND table_name='users' AND column_name='role');
SET @sr = IF(@r = 0, 'ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT ''user''', 'SELECT 1');
PREPARE str FROM @sr; EXECUTE str; DEALLOCATE PREPARE str;

-- 把指定账号设为管理员（把 admin 改成你要的管理员用户名，重复执行幂等）
-- UPDATE users SET role='admin' WHERE username='admin';

-- ============================================================
-- ★ v46 新增：users + questions 加 education 字段（学历：小学1~大学4）
--   users.education     用户学历（注册时填写）
--   questions.education 题目所属学历（前端下拉默认用户学历，可选手动≤用户学历的题库）
-- 幂等：列不存在才加
-- ============================================================

-- 1. users 加 education 列
SET @e = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE table_schema='pet_park' AND table_name='users' AND column_name='education');
SET @se = IF(@e = 0,
  'ALTER TABLE users ADD COLUMN education VARCHAR(16) NOT NULL DEFAULT ''PRIMARY_1'' AFTER nickname',
  'SELECT 1');
PREPARE ste FROM @se; EXECUTE ste; DEALLOCATE PREPARE ste;

-- 2. questions 加 education 列（现有 241 题默认归 PRIMARY_1 = 小学一年级）
SET @qe = (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE table_schema='pet_park' AND table_name='questions' AND column_name='education');
SET @sqe = IF(@qe = 0,
  'ALTER TABLE questions ADD COLUMN education VARCHAR(16) NOT NULL DEFAULT ''PRIMARY_1'' AFTER subject',
  'SELECT 1');
PREPARE ste2 FROM @sqe; EXECUTE ste2; DEALLOCATE PREPARE ste2;

-- ============================================================
-- ★ v48 补全：全部表字段添加 COMMENT（含表级注释），幂等可重复执行
-- ============================================================

-- users 表
ALTER TABLE users COMMENT='用户表（账号 + 积分 + 游戏存档，一用户一行）',
  MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN username VARCHAR(32) NOT NULL COMMENT '用户名（登录账号，唯一）',
  MODIFY COLUMN password VARCHAR(100) NOT NULL COMMENT '密码（BCrypt 哈希）',
  MODIFY COLUMN nickname VARCHAR(32) NULL COMMENT '昵称',
  MODIFY COLUMN education VARCHAR(16) NOT NULL DEFAULT 'PRIMARY_1' COMMENT '学历：PRIMARY_1..6 小学 / JUNIOR_1..3 初中 / SENIOR_1..3 高中 / UNIVERSITY_1..4 大学',
  MODIFY COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' COMMENT '角色：user 普通 / admin 管理员',
  MODIFY COLUMN coins INT NOT NULL DEFAULT 0 COMMENT '积分（独立字段，可查询/统计）',
  MODIFY COLUMN state_json JSON NULL COMMENT '游戏存档 JSON（菜地/宠物等动态状态）',
  MODIFY COLUMN version INT NOT NULL DEFAULT 7 COMMENT '存档版本号（对应前端）',
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（自动）';

-- logs 表
ALTER TABLE logs COMMENT='事件日志表（学习/喂食/收获等流水）',
  MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN user_id BIGINT NOT NULL COMMENT '用户ID（关联 users.id）',
  MODIFY COLUMN type VARCHAR(16) NOT NULL COMMENT '日志类型：feed/play/harvest/watch/study/level...',
  MODIFY COLUMN text VARCHAR(255) NOT NULL COMMENT '日志内容',
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- categories 表
ALTER TABLE categories COMMENT='统一类目表（种植植物/养殖鱼/养殖动物/家具，全在一张表）',
  MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN code VARCHAR(32) NOT NULL COMMENT '唯一标识：carrot/goldfish/chicken/bed',
  MODIFY COLUMN name VARCHAR(32) NOT NULL COMMENT '中文名',
  MODIFY COLUMN type VARCHAR(16) NOT NULL COMMENT '大类：crop 植物 / fish 鱼 / animal 动物 / furniture 家具',
  MODIFY COLUMN price INT NOT NULL DEFAULT 0 COMMENT '购买价（金币）',
  MODIFY COLUMN sell_price INT NOT NULL DEFAULT 0 COMMENT '成熟/产出后售价（金币）',
  MODIFY COLUMN grow_days DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '成长所需天数',
  MODIFY COLUMN feed_days DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '浇水/喂养间隔（天）',
  MODIFY COLUMN exp INT NOT NULL DEFAULT 0 COMMENT '收获/售卖所得经验',
  MODIFY COLUMN level_req INT NOT NULL DEFAULT 1 COMMENT '解锁所需等级',
  MODIFY COLUMN product VARCHAR(32) NULL COMMENT '产出物名称（动物：鸡蛋/鸭蛋/牛奶）',
  MODIFY COLUMN prod_price INT NOT NULL DEFAULT 0 COMMENT '产出物售价',
  MODIFY COLUMN satiety INT NOT NULL DEFAULT 0 COMMENT '作为宠物食物时的饱食增加值',
  MODIFY COLUMN energy INT NOT NULL DEFAULT 0 COMMENT '作为宠物食物时的体力增加值',
  MODIFY COLUMN color VARCHAR(16) NOT NULL DEFAULT '#FFFFFF' COMMENT '主题色（16进制）',
  MODIFY COLUMN icon_svg TEXT NULL COMMENT '可选：SVG 图标（不设则用 code 默认样式）',
  MODIFY COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1 启用 / 0 停用',
  MODIFY COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值（越小越靠前）',
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- questions 表
ALTER TABLE questions COMMENT='学习题库表（兼容多科目 + 多题型 + 多学历）',
  MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN subject VARCHAR(16) NOT NULL COMMENT '科目：english 英语 / math 数学 / hanzi 汉字 / chengyu 成语 / thinking 思维 / yuwen 语文',
  MODIFY COLUMN education VARCHAR(16) NOT NULL DEFAULT 'PRIMARY_1' COMMENT '学历：PRIMARY_1..6 / JUNIOR_1..3 / SENIOR_1..3 / UNIVERSITY_1..4',
  MODIFY COLUMN q_type VARCHAR(16) NOT NULL DEFAULT 'choice' COMMENT '题型：choice 单选 / match 配对 / fill 填空 / qa 问答 / card 卡片',
  MODIFY COLUMN group_id VARCHAR(32) NULL COMMENT '分组标识（animals/加法/反义词...）',
  MODIFY COLUMN group_name VARCHAR(32) NULL COMMENT '分组名称（展示用）',
  MODIFY COLUMN prompt TEXT NOT NULL COMMENT '题干（支持 JSON：图片/富文本）',
  MODIFY COLUMN options JSON NULL COMMENT '选择题选项 [{text, correct, icon}]',
  MODIFY COLUMN answer TEXT NULL COMMENT '正确答案（match 存映射 JSON / fill 存文本 / qa 存参考）',
  MODIFY COLUMN level INT NOT NULL DEFAULT 1 COMMENT '难度等级 1-5',
  MODIFY COLUMN points INT NOT NULL DEFAULT 1 COMMENT '答对所得金币',
  MODIFY COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1 启用 / 0 停用',
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- ============================================================
-- ★ v49 题库重构（上）：现有 241 题 education 重新归类
-- 背景：v46 加 education 列时所有题默认 PRIMARY_1，未按实际难度归类
-- 本次按 课标 + 知识点难度 重新划分：
--   PRIMARY_1：英语基础词(颜色/动物/水果/数字/问候) + 数学(20以内加减/位置/钟表)
--              + 汉字(基础/自然/量词) + 语文(拼音)
--   PRIMARY_2：英语(家庭/身体) + 数学(进位加法/乘法口诀/人民币) + 汉字(反义词)
--              + 成语(常见成语)
--   PRIMARY_3：数学(退位减法/规律) + 成语(成语故事) + 思维(全部)
-- 幂等：重复执行结果一致
-- ============================================================

-- 一年级：最基础词汇 + 20以内加减
UPDATE questions SET education='PRIMARY_1'
 WHERE subject='english' AND group_id IN ('animals','fruits','colors','numbers','greetings','grade1');
UPDATE questions SET education='PRIMARY_1'
 WHERE subject='math' AND group_id IN ('add10','sub10','fill10','grade1','position','clock');
UPDATE questions SET education='PRIMARY_1'
 WHERE subject='hanzi' AND group_id IN ('basic','nature','liangci');
-- 一年级语文：仅拼音旧题（新题按各自年级，不能全改 PRIMARY_1）
UPDATE questions SET education='PRIMARY_1' WHERE subject='yuwen' AND group_id='pinyin';

-- 二年级：家庭/身体词汇 + 乘法口诀 + 反义词
UPDATE questions SET education='PRIMARY_2'
 WHERE subject='english' AND group_id IN ('family','body');
UPDATE questions SET education='PRIMARY_2'
 WHERE subject='math' AND group_id IN ('carry','mul10','money');
UPDATE questions SET education='PRIMARY_2' WHERE subject='hanzi' AND group_id='antonym';
UPDATE questions SET education='PRIMARY_2' WHERE subject='chengyu' AND group_id='common';

-- 三年级：退位减法/规律 + 成语故事 + 思维
UPDATE questions SET education='PRIMARY_3'
 WHERE subject='math' AND group_id IN ('borrow','patterns');
UPDATE questions SET education='PRIMARY_3' WHERE subject='chengyu' AND group_id='animal';
UPDATE questions SET education='PRIMARY_3' WHERE subject='thinking';
-- ============================================================
-- ★ v49 题库重构（下）：新增 2-6 年级三科题库（PRIMARY_2..6）
--   英语/数学/语文 × 5 个年级 × 20 题 = 300 题
--   幂等：唯一索引 uk_ques_subject_group_prompt 防重复
-- ============================================================

-- PRIMARY_2 english（学校与食物词汇）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_2','choice','school','学校与食物词汇','"school" 的意思是？','[{"text": "学校", "correct": true, "icon": ""}, {"text": "医院", "correct": false, "icon": ""}, {"text": "公园", "correct": false, "icon": ""}, {"text": "超市", "correct": false, "icon": ""}]','学校',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"teacher" 的意思是？','[{"text": "老师", "correct": true, "icon": ""}, {"text": "学生", "correct": false, "icon": ""}, {"text": "医生", "correct": false, "icon": ""}, {"text": "工人", "correct": false, "icon": ""}]','老师',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"book" 的意思是？','[{"text": "书", "correct": true, "icon": ""}, {"text": "铅笔", "correct": false, "icon": ""}, {"text": "尺子", "correct": false, "icon": ""}, {"text": "书包", "correct": false, "icon": ""}]','书',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"pen" 的意思是？','[{"text": "钢笔", "correct": true, "icon": ""}, {"text": "铅笔", "correct": false, "icon": ""}, {"text": "橡皮", "correct": false, "icon": ""}, {"text": "蜡笔", "correct": false, "icon": ""}]','钢笔',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"pencil" 的意思是？','[{"text": "铅笔", "correct": true, "icon": ""}, {"text": "钢笔", "correct": false, "icon": ""}, {"text": "剪刀", "correct": false, "icon": ""}, {"text": "胶水", "correct": false, "icon": ""}]','铅笔',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"rice" 的意思是？','[{"text": "米饭", "correct": true, "icon": ""}, {"text": "面条", "correct": false, "icon": ""}, {"text": "馒头", "correct": false, "icon": ""}, {"text": "饺子", "correct": false, "icon": ""}]','米饭',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"noodles" 的意思是？','[{"text": "面条", "correct": true, "icon": ""}, {"text": "米饭", "correct": false, "icon": ""}, {"text": "面包", "correct": false, "icon": ""}, {"text": "蛋糕", "correct": false, "icon": ""}]','面条',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"egg" 的意思是？','[{"text": "鸡蛋", "correct": true, "icon": ""}, {"text": "牛奶", "correct": false, "icon": ""}, {"text": "苹果", "correct": false, "icon": ""}, {"text": "香蕉", "correct": false, "icon": ""}]','鸡蛋',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"milk" 的意思是？','[{"text": "牛奶", "correct": true, "icon": ""}, {"text": "果汁", "correct": false, "icon": ""}, {"text": "可乐", "correct": false, "icon": ""}, {"text": "水", "correct": false, "icon": ""}]','牛奶',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"bread" 的意思是？','[{"text": "面包", "correct": true, "icon": ""}, {"text": "米饭", "correct": false, "icon": ""}, {"text": "饼干", "correct": false, "icon": ""}, {"text": "糖", "correct": false, "icon": ""}]','面包',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"father" 的意思是？','[{"text": "爸爸", "correct": true, "icon": ""}, {"text": "妈妈", "correct": false, "icon": ""}, {"text": "爷爷", "correct": false, "icon": ""}, {"text": "叔叔", "correct": false, "icon": ""}]','爸爸',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"mother" 的意思是？','[{"text": "妈妈", "correct": true, "icon": ""}, {"text": "姐姐", "correct": false, "icon": ""}, {"text": "奶奶", "correct": false, "icon": ""}, {"text": "阿姨", "correct": false, "icon": ""}]','妈妈',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"brother" 的意思是？','[{"text": "兄弟", "correct": true, "icon": ""}, {"text": "姐妹", "correct": false, "icon": ""}, {"text": "父母", "correct": false, "icon": ""}, {"text": "孩子", "correct": false, "icon": ""}]','兄弟',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"sister" 的意思是？','[{"text": "姐妹", "correct": true, "icon": ""}, {"text": "兄弟", "correct": false, "icon": ""}, {"text": "朋友", "correct": false, "icon": ""}, {"text": "同学", "correct": false, "icon": ""}]','姐妹',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"grandpa" 的意思是？','[{"text": "爷爷", "correct": true, "icon": ""}, {"text": "奶奶", "correct": false, "icon": ""}, {"text": "外公", "correct": false, "icon": ""}, {"text": "外婆", "correct": false, "icon": ""}]','爷爷',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"How are you?" 的正确答语是？','[{"text": "I''m fine, thank you.", "correct": true, "icon": ""}, {"text": "I''m nine.", "correct": false, "icon": ""}, {"text": "Yes, I am.", "correct": false, "icon": ""}, {"text": "Thank you.", "correct": false, "icon": ""}]','I''m fine, thank you.',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"Thank you" 的意思是？','[{"text": "谢谢你", "correct": true, "icon": ""}, {"text": "对不起", "correct": false, "icon": ""}, {"text": "没关系", "correct": false, "icon": ""}, {"text": "再见", "correct": false, "icon": ""}]','谢谢你',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"Sorry" 的意思是？','[{"text": "对不起", "correct": true, "icon": ""}, {"text": "谢谢", "correct": false, "icon": ""}, {"text": "你好", "correct": false, "icon": ""}, {"text": "再见", "correct": false, "icon": ""}]','对不起',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"Good morning" 的意思是？','[{"text": "早上好", "correct": true, "icon": ""}, {"text": "下午好", "correct": false, "icon": ""}, {"text": "晚上好", "correct": false, "icon": ""}, {"text": "晚安", "correct": false, "icon": ""}]','早上好',1,1,1),
('english','PRIMARY_2','choice','school','学校与食物词汇','"Good night" 的意思是？','[{"text": "晚安", "correct": true, "icon": ""}, {"text": "早上好", "correct": false, "icon": ""}, {"text": "你好", "correct": false, "icon": ""}, {"text": "再见", "correct": false, "icon": ""}]','晚安',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_2 math（乘法口诀与人民币）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','3 × 4 = ？','[{"text": "12", "correct": true, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "16", "correct": false, "icon": ""}]','12',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','2 × 6 = ？','[{"text": "12", "correct": true, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "14", "correct": false, "icon": ""}]','12',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','5 × 3 = ？','[{"text": "15", "correct": true, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "18", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}]','15',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','7 × 2 = ？','[{"text": "14", "correct": true, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "18", "correct": false, "icon": ""}]','14',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','4 × 5 = ？','[{"text": "20", "correct": true, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "24", "correct": false, "icon": ""}, {"text": "15", "correct": false, "icon": ""}]','20',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','6 × 3 = ？','[{"text": "18", "correct": true, "icon": ""}, {"text": "15", "correct": false, "icon": ""}, {"text": "21", "correct": false, "icon": ""}, {"text": "24", "correct": false, "icon": ""}]','18',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','8 × 2 = ？','[{"text": "16", "correct": true, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "18", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}]','16',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','7 + 8 = ？（进位加法）','[{"text": "15", "correct": true, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "17", "correct": false, "icon": ""}]','15',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','9 + 6 = ？','[{"text": "15", "correct": true, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "13", "correct": false, "icon": ""}]','15',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','8 + 5 = ？','[{"text": "13", "correct": true, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "15", "correct": false, "icon": ""}]','13',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','15 - 7 = ？（退位减法）','[{"text": "8", "correct": true, "icon": ""}, {"text": "7", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}]','8',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','13 - 6 = ？','[{"text": "7", "correct": true, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "5", "correct": false, "icon": ""}]','7',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','16 - 8 = ？','[{"text": "8", "correct": true, "icon": ""}, {"text": "7", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}]','8',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','1 元 = ？ 角','[{"text": "10", "correct": true, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}, {"text": "100", "correct": false, "icon": ""}]','10',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','1 角 = ？ 分','[{"text": "10", "correct": true, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}, {"text": "100", "correct": false, "icon": ""}]','10',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','5 元 + 3 元 = ？','[{"text": "8元", "correct": false, "icon": ""}, {"text": "7元", "correct": false, "icon": ""}, {"text": "9元", "correct": false, "icon": ""}, {"text": "6元", "correct": false, "icon": ""}]','8 元',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','20 元 - 8 元 = ？','[{"text": "12元", "correct": false, "icon": ""}, {"text": "10元", "correct": false, "icon": ""}, {"text": "14元", "correct": false, "icon": ""}, {"text": "15元", "correct": false, "icon": ""}]','12 元',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','6 × 4 = ？','[{"text": "24", "correct": true, "icon": ""}, {"text": "20", "correct": false, "icon": ""}, {"text": "28", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}]','24',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','9 × 3 = ？','[{"text": "27", "correct": true, "icon": ""}, {"text": "24", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}, {"text": "21", "correct": false, "icon": ""}]','27',1,1,1),
('math','PRIMARY_2','choice','mul10','乘法口诀与人民币','2 × 9 = ？','[{"text": "18", "correct": true, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}]','18',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_2 yuwen（近义词反义词与量词）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"美丽" 的近义词是？','[{"text": "漂亮", "correct": true, "icon": ""}, {"text": "丑陋", "correct": false, "icon": ""}, {"text": "可爱", "correct": false, "icon": ""}, {"text": "干净", "correct": false, "icon": ""}]','漂亮',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"高兴" 的近义词是？','[{"text": "快乐", "correct": true, "icon": ""}, {"text": "难过", "correct": false, "icon": ""}, {"text": "生气", "correct": false, "icon": ""}, {"text": "害怕", "correct": false, "icon": ""}]','快乐',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"大" 的反义词是？','[{"text": "小", "correct": true, "icon": ""}, {"text": "多", "correct": false, "icon": ""}, {"text": "高", "correct": false, "icon": ""}, {"text": "长", "correct": false, "icon": ""}]','小',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"上" 的反义词是？','[{"text": "下", "correct": true, "icon": ""}, {"text": "左", "correct": false, "icon": ""}, {"text": "前", "correct": false, "icon": ""}, {"text": "里", "correct": false, "icon": ""}]','下',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"黑" 的反义词是？','[{"text": "白", "correct": true, "icon": ""}, {"text": "红", "correct": false, "icon": ""}, {"text": "黄", "correct": false, "icon": ""}, {"text": "绿", "correct": false, "icon": ""}]','白',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','一（ ）书','[{"text": "本", "correct": true, "icon": ""}, {"text": "头", "correct": false, "icon": ""}, {"text": "只", "correct": false, "icon": ""}, {"text": "条", "correct": false, "icon": ""}]','本',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','一（ ）牛','[{"text": "头", "correct": true, "icon": ""}, {"text": "只", "correct": false, "icon": ""}, {"text": "匹", "correct": false, "icon": ""}, {"text": "条", "correct": false, "icon": ""}]','头',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','一（ ）花','[{"text": "朵", "correct": true, "icon": ""}, {"text": "棵", "correct": false, "icon": ""}, {"text": "片", "correct": false, "icon": ""}, {"text": "枝", "correct": false, "icon": ""}]','朵',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','一（ ）鱼','[{"text": "条", "correct": true, "icon": ""}, {"text": "匹", "correct": false, "icon": ""}, {"text": "只", "correct": false, "icon": ""}, {"text": "头", "correct": false, "icon": ""}]','条',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','一（ ）马','[{"text": "匹", "correct": true, "icon": ""}, {"text": "头", "correct": false, "icon": ""}, {"text": "只", "correct": false, "icon": ""}, {"text": "条", "correct": false, "icon": ""}]','匹',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"我是小学生。" 句末应该用？','[{"text": "句号", "correct": true, "icon": ""}, {"text": "问号", "correct": false, "icon": ""}, {"text": "感叹号", "correct": false, "icon": ""}, {"text": "省略号", "correct": false, "icon": ""}]','句号',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"你好吗？" 句末应该用？','[{"text": "问号", "correct": true, "icon": ""}, {"text": "句号", "correct": false, "icon": ""}, {"text": "感叹号", "correct": false, "icon": ""}, {"text": "顿号", "correct": false, "icon": ""}]','问号',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"快跑！" 句末应该用？','[{"text": "感叹号", "correct": true, "icon": ""}, {"text": "句号", "correct": false, "icon": ""}, {"text": "问号", "correct": false, "icon": ""}, {"text": "逗号", "correct": false, "icon": ""}]','感叹号',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"仔细" 的近义词是？','[{"text": "认真", "correct": true, "icon": ""}, {"text": "马虎", "correct": false, "icon": ""}, {"text": "粗心", "correct": false, "icon": ""}, {"text": "快速", "correct": false, "icon": ""}]','认真',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"快" 的反义词是？','[{"text": "慢", "correct": true, "icon": ""}, {"text": "急", "correct": false, "icon": ""}, {"text": "忙", "correct": false, "icon": ""}, {"text": "快活", "correct": false, "icon": ""}]','慢',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','一（ ）树','[{"text": "棵", "correct": true, "icon": ""}, {"text": "朵", "correct": false, "icon": ""}, {"text": "片", "correct": false, "icon": ""}, {"text": "根", "correct": false, "icon": ""}]','棵',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','一（ ）桌子','[{"text": "张", "correct": true, "icon": ""}, {"text": "把", "correct": false, "icon": ""}, {"text": "个", "correct": false, "icon": ""}, {"text": "台", "correct": false, "icon": ""}]','张',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"温暖" 的反义词是？','[{"text": "寒冷", "correct": true, "icon": ""}, {"text": "炎热", "correct": false, "icon": ""}, {"text": "凉爽", "correct": false, "icon": ""}, {"text": "温暖", "correct": false, "icon": ""}]','寒冷',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"伤心" 的近义词是？','[{"text": "难过", "correct": true, "icon": ""}, {"text": "高兴", "correct": false, "icon": ""}, {"text": "开心", "correct": false, "icon": ""}, {"text": "激动", "correct": false, "icon": ""}]','难过',1,1,1),
('yuwen','PRIMARY_2','choice','jinyifan','近义词反义词与量词','"哭" 的反义词是？','[{"text": "笑", "correct": true, "icon": ""}, {"text": "叫", "correct": false, "icon": ""}, {"text": "闹", "correct": false, "icon": ""}, {"text": "说", "correct": false, "icon": ""}]','笑',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_3 english（时间天气与星期）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"What time is it?" 的正确答语是？','[{"text": "It''s eight o''clock.", "correct": true, "icon": ""}, {"text": "I''m eight.", "correct": false, "icon": ""}, {"text": "It''s a clock.", "correct": false, "icon": ""}, {"text": "Yes, it is.", "correct": false, "icon": ""}]','It''s eight o''clock.',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"sunny" 的意思是？','[{"text": "晴朗的", "correct": true, "icon": ""}, {"text": "下雨的", "correct": false, "icon": ""}, {"text": "有风的", "correct": false, "icon": ""}, {"text": "多云的", "correct": false, "icon": ""}]','晴朗的',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"rainy" 的意思是？','[{"text": "下雨的", "correct": true, "icon": ""}, {"text": "晴朗的", "correct": false, "icon": ""}, {"text": "下雪的", "correct": false, "icon": ""}, {"text": "有雾的", "correct": false, "icon": ""}]','下雨的',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"windy" 的意思是？','[{"text": "有风的", "correct": true, "icon": ""}, {"text": "下雨的", "correct": false, "icon": ""}, {"text": "晴朗的", "correct": false, "icon": ""}, {"text": "炎热的", "correct": false, "icon": ""}]','有风的',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"cloudy" 的意思是？','[{"text": "多云的", "correct": true, "icon": ""}, {"text": "晴朗的", "correct": false, "icon": ""}, {"text": "下雨的", "correct": false, "icon": ""}, {"text": "有雾的", "correct": false, "icon": ""}]','多云的',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"Monday" 的意思是？','[{"text": "星期一", "correct": true, "icon": ""}, {"text": "星期日", "correct": false, "icon": ""}, {"text": "星期三", "correct": false, "icon": ""}, {"text": "星期五", "correct": false, "icon": ""}]','星期一',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"Sunday" 的意思是？','[{"text": "星期日", "correct": true, "icon": ""}, {"text": "星期一", "correct": false, "icon": ""}, {"text": "星期六", "correct": false, "icon": ""}, {"text": "星期二", "correct": false, "icon": ""}]','星期日',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"ruler" 的意思是？','[{"text": "尺子", "correct": true, "icon": ""}, {"text": "橡皮", "correct": false, "icon": ""}, {"text": "铅笔", "correct": false, "icon": ""}, {"text": "剪刀", "correct": false, "icon": ""}]','尺子',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"eraser" 的意思是？','[{"text": "橡皮", "correct": true, "icon": ""}, {"text": "尺子", "correct": false, "icon": ""}, {"text": "卷笔刀", "correct": false, "icon": ""}, {"text": "书包", "correct": false, "icon": ""}]','橡皮',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"bag" 的意思是？','[{"text": "书包", "correct": true, "icon": ""}, {"text": "文具盒", "correct": false, "icon": ""}, {"text": "铅笔", "correct": false, "icon": ""}, {"text": "课本", "correct": false, "icon": ""}]','书包',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','一年有几个季节？','[{"text": "4个", "correct": true, "icon": ""}, {"text": "3个", "correct": false, "icon": ""}, {"text": "2个", "correct": false, "icon": ""}, {"text": "5个", "correct": false, "icon": ""}]','4个',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"spring" 的意思是？','[{"text": "春天", "correct": true, "icon": ""}, {"text": "夏天", "correct": false, "icon": ""}, {"text": "秋天", "correct": false, "icon": ""}, {"text": "冬天", "correct": false, "icon": ""}]','春天',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"summer" 的意思是？','[{"text": "夏天", "correct": true, "icon": ""}, {"text": "春天", "correct": false, "icon": ""}, {"text": "冬天", "correct": false, "icon": ""}, {"text": "秋天", "correct": false, "icon": ""}]','夏天',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"autumn" 的意思是？','[{"text": "秋天", "correct": true, "icon": ""}, {"text": "冬天", "correct": false, "icon": ""}, {"text": "春天", "correct": false, "icon": ""}, {"text": "夏天", "correct": false, "icon": ""}]','秋天',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"winter" 的意思是？','[{"text": "冬天", "correct": true, "icon": ""}, {"text": "秋天", "correct": false, "icon": ""}, {"text": "春天", "correct": false, "icon": ""}, {"text": "夏天", "correct": false, "icon": ""}]','冬天',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','I have ___ apple. 横线填？','[{"text": "an", "correct": true, "icon": ""}, {"text": "a", "correct": false, "icon": ""}, {"text": "the", "correct": false, "icon": ""}, {"text": "不填", "correct": false, "icon": ""}]','an',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"fifteen" 表示数字？','[{"text": "15", "correct": true, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "50", "correct": false, "icon": ""}]','15',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"twenty" 表示数字？','[{"text": "20", "correct": true, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "22", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}]','20',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"What''s your name?" 的正确答语？','[{"text": "My name is Tom.", "correct": true, "icon": ""}, {"text": "I''m ten.", "correct": false, "icon": ""}, {"text": "Yes, I am.", "correct": false, "icon": ""}, {"text": "Goodbye.", "correct": false, "icon": ""}]','My name is Tom.',1,1,1),
('english','PRIMARY_3','choice','time_weather','时间天气与星期','"Friday" 的意思是？','[{"text": "星期五", "correct": true, "icon": ""}, {"text": "星期四", "correct": false, "icon": ""}, {"text": "星期三", "correct": false, "icon": ""}, {"text": "星期六", "correct": false, "icon": ""}]','星期五',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_3 math（多位数运算与分数初步）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','23 + 45 = ？','[{"text": "68", "correct": true, "icon": ""}, {"text": "78", "correct": false, "icon": ""}, {"text": "58", "correct": false, "icon": ""}, {"text": "88", "correct": false, "icon": ""}]','68',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','56 - 19 = ？','[{"text": "37", "correct": true, "icon": ""}, {"text": "47", "correct": false, "icon": ""}, {"text": "27", "correct": false, "icon": ""}, {"text": "57", "correct": false, "icon": ""}]','37',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','12 × 3 = ？','[{"text": "36", "correct": true, "icon": ""}, {"text": "32", "correct": false, "icon": ""}, {"text": "40", "correct": false, "icon": ""}, {"text": "48", "correct": false, "icon": ""}]','36',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','15 × 4 = ？','[{"text": "60", "correct": true, "icon": ""}, {"text": "55", "correct": false, "icon": ""}, {"text": "65", "correct": false, "icon": ""}, {"text": "45", "correct": false, "icon": ""}]','60',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','24 × 2 = ？','[{"text": "48", "correct": true, "icon": ""}, {"text": "46", "correct": false, "icon": ""}, {"text": "52", "correct": false, "icon": ""}, {"text": "40", "correct": false, "icon": ""}]','48',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','1/2 + 1/2 = ？','[{"text": "1", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "1/4", "correct": false, "icon": ""}, {"text": "2/4", "correct": false, "icon": ""}]','1',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','1/4 表示？','[{"text": "把整体平均分成4份取1份", "correct": true, "icon": ""}, {"text": "把整体分成4份取4份", "correct": false, "icon": ""}, {"text": "把整体平均分成4份取3份", "correct": false, "icon": ""}, {"text": "把整体平均分成1份取4份", "correct": false, "icon": ""}]','把整体平均分成4份取1份',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','2/3 读作？','[{"text": "三分之二", "correct": true, "icon": ""}, {"text": "二分之三", "correct": false, "icon": ""}, {"text": "三分之三", "correct": false, "icon": ""}, {"text": "二分之二", "correct": false, "icon": ""}]','三分之二',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','34 + 27 = ？','[{"text": "61", "correct": true, "icon": ""}, {"text": "51", "correct": false, "icon": ""}, {"text": "71", "correct": false, "icon": ""}, {"text": "41", "correct": false, "icon": ""}]','61',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','81 - 36 = ？','[{"text": "45", "correct": true, "icon": ""}, {"text": "55", "correct": false, "icon": ""}, {"text": "35", "correct": false, "icon": ""}, {"text": "65", "correct": false, "icon": ""}]','45',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','13 × 3 = ？','[{"text": "39", "correct": true, "icon": ""}, {"text": "36", "correct": false, "icon": ""}, {"text": "42", "correct": false, "icon": ""}, {"text": "33", "correct": false, "icon": ""}]','39',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','边长 4 厘米的正方形周长是？','[{"text": "16厘米", "correct": false, "icon": ""}, {"text": "8厘米", "correct": false, "icon": ""}, {"text": "12厘米", "correct": false, "icon": ""}, {"text": "20厘米", "correct": false, "icon": ""}]','16 厘米',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','5 的 6 倍是？','[{"text": "30", "correct": true, "icon": ""}, {"text": "25", "correct": false, "icon": ""}, {"text": "35", "correct": false, "icon": ""}, {"text": "11", "correct": false, "icon": ""}]','30',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','48 ÷ 8 = ？','[{"text": "6", "correct": true, "icon": ""}, {"text": "7", "correct": false, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','63 ÷ 7 = ？','[{"text": "9", "correct": true, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "7", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}]','9',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','500 + 300 = ？','[{"text": "800", "correct": true, "icon": ""}, {"text": "700", "correct": false, "icon": ""}, {"text": "900", "correct": false, "icon": ""}, {"text": "1000", "correct": false, "icon": ""}]','800',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','1000 - 400 = ？','[{"text": "600", "correct": true, "icon": ""}, {"text": "500", "correct": false, "icon": ""}, {"text": "700", "correct": false, "icon": ""}, {"text": "400", "correct": false, "icon": ""}]','600',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','22 × 4 = ？','[{"text": "88", "correct": true, "icon": ""}, {"text": "86", "correct": false, "icon": ""}, {"text": "84", "correct": false, "icon": ""}, {"text": "80", "correct": false, "icon": ""}]','88',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','11 × 8 = ？','[{"text": "88", "correct": true, "icon": ""}, {"text": "80", "correct": false, "icon": ""}, {"text": "86", "correct": false, "icon": ""}, {"text": "90", "correct": false, "icon": ""}]','88',1,1,1),
('math','PRIMARY_3','choice','multi_digit','多位数运算与分数初步','7 × 40 = ？','[{"text": "280", "correct": true, "icon": ""}, {"text": "240", "correct": false, "icon": ""}, {"text": "320", "correct": false, "icon": ""}, {"text": "210", "correct": false, "icon": ""}]','280',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_3 yuwen（成语与修辞）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"守株待兔" 形容？','[{"text": "不努力却妄想有收获", "correct": true, "icon": ""}, {"text": "勤奋学习", "correct": false, "icon": ""}, {"text": "助人为乐", "correct": false, "icon": ""}, {"text": "坚持到底", "correct": false, "icon": ""}]','不努力却妄想有收获',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"画蛇添足" 形容？','[{"text": "多此一举", "correct": true, "icon": ""}, {"text": "画得很像", "correct": false, "icon": ""}, {"text": "动作麻利", "correct": false, "icon": ""}, {"text": "小心翼翼", "correct": false, "icon": ""}]','多此一举',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"亡羊补牢" 告诉我们？','[{"text": "出了问题要及时补救", "correct": true, "icon": ""}, {"text": "羊丢了就哭", "correct": false, "icon": ""}, {"text": "做事要勇敢", "correct": false, "icon": ""}, {"text": "不要轻信别人", "correct": false, "icon": ""}]','出了问题要及时补救',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"拔苗助长" 形容？','[{"text": "违反规律急于求成", "correct": true, "icon": ""}, {"text": "帮助别人", "correct": false, "icon": ""}, {"text": "照顾庄稼", "correct": false, "icon": ""}, {"text": "勤快劳动", "correct": false, "icon": ""}]','违反规律急于求成',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"井底之蛙" 形容？','[{"text": "眼界狭小", "correct": true, "icon": ""}, {"text": "见多识广", "correct": false, "icon": ""}, {"text": "快乐自在", "correct": false, "icon": ""}, {"text": "井水很深", "correct": false, "icon": ""}]','眼界狭小',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"月亮像一个大玉盘" 用了什么修辞？','[{"text": "比喻", "correct": true, "icon": ""}, {"text": "拟人", "correct": false, "icon": ""}, {"text": "夸张", "correct": false, "icon": ""}, {"text": "排比", "correct": false, "icon": ""}]','比喻',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"花儿在风中点头" 用了什么修辞？','[{"text": "拟人", "correct": true, "icon": ""}, {"text": "比喻", "correct": false, "icon": ""}, {"text": "夸张", "correct": false, "icon": ""}, {"text": "反问", "correct": false, "icon": ""}]','拟人',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"高瞻远瞩" 的意思是？','[{"text": "站得高看得远", "correct": true, "icon": ""}, {"text": "个子很高", "correct": false, "icon": ""}, {"text": "看得见远处", "correct": false, "icon": ""}, {"text": "胆小怕事", "correct": false, "icon": ""}]','站得高看得远',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"坚持不懈" 的意思是？','[{"text": "坚持到底不松懈", "correct": true, "icon": ""}, {"text": "很快放弃", "correct": false, "icon": ""}, {"text": "松松散散", "correct": false, "icon": ""}, {"text": "半途而废", "correct": false, "icon": ""}]','坚持到底不松懈',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"胸有成竹" 形容？','[{"text": "做事有把握", "correct": true, "icon": ""}, {"text": "心里装着竹子", "correct": false, "icon": ""}, {"text": "害怕发抖", "correct": false, "icon": ""}, {"text": "犹豫不决", "correct": false, "icon": ""}]','做事有把握',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"对牛弹琴" 形容？','[{"text": "说话不看对象", "correct": true, "icon": ""}, {"text": "音乐好听", "correct": false, "icon": ""}, {"text": "牛很聪明", "correct": false, "icon": ""}, {"text": "弹琴很动听", "correct": false, "icon": ""}]','说话不看对象',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"东张西望" 的意思是？','[{"text": "四处张望", "correct": true, "icon": ""}, {"text": "东边西边", "correct": false, "icon": ""}, {"text": "仔细看书", "correct": false, "icon": ""}, {"text": "来回走动", "correct": false, "icon": ""}]','四处张望',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"三心二意" 的反义词是？','[{"text": "一心一意", "correct": true, "icon": ""}, {"text": "马马虎虎", "correct": false, "icon": ""}, {"text": "三心二意", "correct": false, "icon": ""}, {"text": "心不在焉", "correct": false, "icon": ""}]','一心一意',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"千钧一发" 形容？','[{"text": "情况极其危急", "correct": true, "icon": ""}, {"text": "头发很重", "correct": false, "icon": ""}, {"text": "力气很大", "correct": false, "icon": ""}, {"text": "时间很长", "correct": false, "icon": ""}]','情况极其危急',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"目瞪口呆" 形容？','[{"text": "吃惊发愣的样子", "correct": true, "icon": ""}, {"text": "眼睛很大", "correct": false, "icon": ""}, {"text": "嘴巴很大", "correct": false, "icon": ""}, {"text": "眼睛很亮", "correct": false, "icon": ""}]','吃惊发愣的样子',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"自言自语" 的意思是？','[{"text": "自己对自己说话", "correct": true, "icon": ""}, {"text": "两个人聊天", "correct": false, "icon": ""}, {"text": "大声说话", "correct": false, "icon": ""}, {"text": "小声说话", "correct": false, "icon": ""}]','自己对自己说话',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"雪中送炭" 形容？','[{"text": "危难时给人帮助", "correct": true, "icon": ""}, {"text": "下雪了", "correct": false, "icon": ""}, {"text": "送礼物", "correct": false, "icon": ""}, {"text": "冬天很冷", "correct": false, "icon": ""}]','危难时给人帮助',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"大公无私" 形容？','[{"text": "公正无私", "correct": true, "icon": ""}, {"text": "自私自利", "correct": false, "icon": ""}, {"text": "胆小怕事", "correct": false, "icon": ""}, {"text": "大大咧咧", "correct": false, "icon": ""}]','公正无私',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"视而不见" 的意思是？','[{"text": "看见了当作没看见", "correct": true, "icon": ""}, {"text": "看不见", "correct": false, "icon": ""}, {"text": "眼睛不好", "correct": false, "icon": ""}, {"text": "视力很差", "correct": false, "icon": ""}]','看见了当作没看见',1,1,1),
('yuwen','PRIMARY_3','choice','chengyu3','成语与修辞','"半途而废" 形容？','[{"text": "做事中途停止", "correct": true, "icon": ""}, {"text": "坚持到底", "correct": false, "icon": ""}, {"text": "做事很快", "correct": false, "icon": ""}, {"text": "半路跌倒", "correct": false, "icon": ""}]','做事中途停止',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_4 english（职业地点与进行时）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"doctor" 的意思是？','[{"text": "医生", "correct": true, "icon": ""}, {"text": "护士", "correct": false, "icon": ""}, {"text": "教师", "correct": false, "icon": ""}, {"text": "警察", "correct": false, "icon": ""}]','医生',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"teacher" 表示职业？','[{"text": "老师", "correct": true, "icon": ""}, {"text": "医生", "correct": false, "icon": ""}, {"text": "司机", "correct": false, "icon": ""}, {"text": "厨师", "correct": false, "icon": ""}]','老师',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"nurse" 的意思是？','[{"text": "护士", "correct": true, "icon": ""}, {"text": "医生", "correct": false, "icon": ""}, {"text": "老师", "correct": false, "icon": ""}, {"text": "工程师", "correct": false, "icon": ""}]','护士',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"library" 的意思是？','[{"text": "图书馆", "correct": true, "icon": ""}, {"text": "医院", "correct": false, "icon": ""}, {"text": "超市", "correct": false, "icon": ""}, {"text": "邮局", "correct": false, "icon": ""}]','图书馆',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"park" 的意思是？','[{"text": "公园", "correct": true, "icon": ""}, {"text": "车站", "correct": false, "icon": ""}, {"text": "学校", "correct": false, "icon": ""}, {"text": "饭店", "correct": false, "icon": ""}]','公园',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"hospital" 的意思是？','[{"text": "医院", "correct": true, "icon": ""}, {"text": "学校", "correct": false, "icon": ""}, {"text": "银行", "correct": false, "icon": ""}, {"text": "电影院", "correct": false, "icon": ""}]','医院',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','I like ___（游泳）','[{"text": "swimming", "correct": true, "icon": ""}, {"text": "swim", "correct": false, "icon": ""}, {"text": "swims", "correct": false, "icon": ""}, {"text": "swiming", "correct": false, "icon": ""}]','swimming',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"reading" 的意思是？','[{"text": "阅读", "correct": true, "icon": ""}, {"text": "跑步", "correct": false, "icon": ""}, {"text": "跳舞", "correct": false, "icon": ""}, {"text": "唱歌", "correct": false, "icon": ""}]','阅读',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','He is ___（正在跑）','[{"text": "running", "correct": true, "icon": ""}, {"text": "runing", "correct": false, "icon": ""}, {"text": "runs", "correct": false, "icon": ""}, {"text": "run", "correct": false, "icon": ""}]','running',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','They are ___（正在唱歌）','[{"text": "singing", "correct": true, "icon": ""}, {"text": "singing", "correct": true, "icon": ""}, {"text": "sings", "correct": false, "icon": ""}, {"text": "sang", "correct": false, "icon": ""}]','singing',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"supermarket" 的意思是？','[{"text": "超市", "correct": true, "icon": ""}, {"text": "市场", "correct": false, "icon": ""}, {"text": "书店", "correct": false, "icon": ""}, {"text": "药店", "correct": false, "icon": ""}]','超市',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"restaurant" 的意思是？','[{"text": "餐馆", "correct": true, "icon": ""}, {"text": "宾馆", "correct": false, "icon": ""}, {"text": "银行", "correct": false, "icon": ""}, {"text": "邮局", "correct": false, "icon": ""}]','餐馆',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"policeman" 的意思是？','[{"text": "警察", "correct": true, "icon": ""}, {"text": "消防员", "correct": false, "icon": ""}, {"text": "保安", "correct": false, "icon": ""}, {"text": "军人", "correct": false, "icon": ""}]','警察',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"farmer" 的意思是？','[{"text": "农民", "correct": true, "icon": ""}, {"text": "工人", "correct": false, "icon": ""}, {"text": "司机", "correct": false, "icon": ""}, {"text": "渔民", "correct": false, "icon": ""}]','农民',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"worker" 的意思是？','[{"text": "工人", "correct": true, "icon": ""}, {"text": "农民", "correct": false, "icon": ""}, {"text": "学生", "correct": false, "icon": ""}, {"text": "商人", "correct": false, "icon": ""}]','工人',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"What are you doing?" 的正确答语？','[{"text": "I''m playing.", "correct": true, "icon": ""}, {"text": "I''m fine.", "correct": false, "icon": ""}, {"text": "Yes, I am.", "correct": false, "icon": ""}, {"text": "I like it.", "correct": false, "icon": ""}]','I''m playing.',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"interesting" 的意思是？','[{"text": "有趣的", "correct": true, "icon": ""}, {"text": "无聊的", "correct": false, "icon": ""}, {"text": "困难的", "correct": false, "icon": ""}, {"text": "简单的", "correct": false, "icon": ""}]','有趣的',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"boring" 的意思是？','[{"text": "无聊的", "correct": true, "icon": ""}, {"text": "有趣的", "correct": false, "icon": ""}, {"text": "开心的", "correct": false, "icon": ""}, {"text": "精彩的", "correct": false, "icon": ""}]','无聊的',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','She is ___（正在写）','[{"text": "writing", "correct": true, "icon": ""}, {"text": "writeing", "correct": false, "icon": ""}, {"text": "writes", "correct": false, "icon": ""}, {"text": "write", "correct": false, "icon": ""}]','writing',1,1,1),
('english','PRIMARY_4','choice','jobs_places','职业地点与进行时','"museum" 的意思是？','[{"text": "博物馆", "correct": true, "icon": ""}, {"text": "图书馆", "correct": false, "icon": ""}, {"text": "体育馆", "correct": false, "icon": ""}, {"text": "电影院", "correct": false, "icon": ""}]','博物馆',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_4 math（小数与几何）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_4','choice','decimal','小数与几何','0.5 + 0.3 = ？','[{"text": "0.8", "correct": true, "icon": ""}, {"text": "0.6", "correct": false, "icon": ""}, {"text": "0.7", "correct": false, "icon": ""}, {"text": "1.0", "correct": false, "icon": ""}]','0.8',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','1.2 - 0.7 = ？','[{"text": "0.5", "correct": true, "icon": ""}, {"text": "0.6", "correct": false, "icon": ""}, {"text": "0.4", "correct": false, "icon": ""}, {"text": "0.7", "correct": false, "icon": ""}]','0.5',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','0.25 读作？','[{"text": "零点二五", "correct": true, "icon": ""}, {"text": "二十五", "correct": false, "icon": ""}, {"text": "零点二", "correct": false, "icon": ""}, {"text": "二点五", "correct": false, "icon": ""}]','零点二五',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','三角形内角和是？','[{"text": "180度", "correct": false, "icon": ""}, {"text": "90度", "correct": false, "icon": ""}, {"text": "360度", "correct": false, "icon": ""}, {"text": "100度", "correct": false, "icon": ""}]','180 度',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','长方形面积 = ？','[{"text": "长 × 宽", "correct": true, "icon": ""}, {"text": "长 + 宽", "correct": false, "icon": ""}, {"text": "长 × 高", "correct": false, "icon": ""}, {"text": "底 × 高", "correct": false, "icon": ""}]','长 × 宽',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','长 5 宽 3 的长方形面积是？','[{"text": "15", "correct": true, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}]','15',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','边长 6 的正方形面积是？','[{"text": "36", "correct": true, "icon": ""}, {"text": "24", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}]','36',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','0.75 表示？','[{"text": "四分之三", "correct": true, "icon": ""}, {"text": "三分之四", "correct": false, "icon": ""}, {"text": "四分之一", "correct": false, "icon": ""}, {"text": "七分之五", "correct": false, "icon": ""}]','四分之三',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','3.5 + 2.5 = ？','[{"text": "6", "correct": true, "icon": ""}, {"text": "6.0", "correct": false, "icon": ""}, {"text": "5.5", "correct": false, "icon": ""}, {"text": "7", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','10 - 3.6 = ？','[{"text": "6.4", "correct": true, "icon": ""}, {"text": "6.6", "correct": false, "icon": ""}, {"text": "7.4", "correct": false, "icon": ""}, {"text": "5.4", "correct": false, "icon": ""}]','6.4',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','直角三角形的直角是几度？','[{"text": "90度", "correct": false, "icon": ""}, {"text": "180度", "correct": false, "icon": ""}, {"text": "60度", "correct": false, "icon": ""}, {"text": "45度", "correct": false, "icon": ""}]','90 度',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','等腰三角形有两条边？','[{"text": "相等", "correct": true, "icon": ""}, {"text": "不相等", "correct": false, "icon": ""}, {"text": "都是直角", "correct": false, "icon": ""}, {"text": "都最长", "correct": false, "icon": ""}]','相等',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','平行四边形的面积 = ？','[{"text": "底 × 高", "correct": true, "icon": ""}, {"text": "长 × 宽", "correct": false, "icon": ""}, {"text": "边长 × 4", "correct": false, "icon": ""}, {"text": "半径 × 2", "correct": false, "icon": ""}]','底 × 高',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','底 6 高 4 的平行四边形面积是？','[{"text": "24", "correct": true, "icon": ""}, {"text": "20", "correct": false, "icon": ""}, {"text": "28", "correct": false, "icon": ""}, {"text": "36", "correct": false, "icon": ""}]','24',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','0.1 + 0.9 = ？','[{"text": "1", "correct": true, "icon": ""}, {"text": "1.0", "correct": false, "icon": ""}, {"text": "0.10", "correct": false, "icon": ""}, {"text": "0.9", "correct": false, "icon": ""}]','1',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','4.2 - 1.8 = ？','[{"text": "2.4", "correct": true, "icon": ""}, {"text": "2.6", "correct": false, "icon": ""}, {"text": "3.4", "correct": false, "icon": ""}, {"text": "2.2", "correct": false, "icon": ""}]','2.4',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','三角形有几条边？','[{"text": "3条", "correct": false, "icon": ""}, {"text": "4条", "correct": false, "icon": ""}, {"text": "2条", "correct": false, "icon": ""}, {"text": "5条", "correct": false, "icon": ""}]','3 条',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','圆有几条对称轴？','[{"text": "无数条", "correct": true, "icon": ""}, {"text": "1条", "correct": false, "icon": ""}, {"text": "2条", "correct": false, "icon": ""}, {"text": "4条", "correct": false, "icon": ""}]','无数条',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','15 × 0.2 = ？','[{"text": "3", "correct": true, "icon": ""}, {"text": "3.0", "correct": false, "icon": ""}, {"text": "2.5", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}]','3',1,1,1),
('math','PRIMARY_4','choice','decimal','小数与几何','1 平方米 = ？ 平方分米','[{"text": "100", "correct": true, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "1000", "correct": false, "icon": ""}, {"text": "50", "correct": false, "icon": ""}]','100',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_4 yuwen（关联词与缩句）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','（ ）下雨了，（ ）运动会照常进行','[{"text": "虽然...但是", "correct": true, "icon": ""}, {"text": "因为...所以", "correct": false, "icon": ""}, {"text": "不但...而且", "correct": false, "icon": ""}, {"text": "如果...就", "correct": false, "icon": ""}]','虽然...但是',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','（ ）努力，（ ）会成功','[{"text": "只要...就", "correct": true, "icon": ""}, {"text": "虽然...但是", "correct": false, "icon": ""}, {"text": "不但...而且", "correct": false, "icon": ""}, {"text": "一边...一边", "correct": false, "icon": ""}]','只要...就',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','缩句："漂亮的蝴蝶在花园里翩翩起舞" →','[{"text": "蝴蝶起舞", "correct": true, "icon": ""}, {"text": "蝴蝶在花园里", "correct": false, "icon": ""}, {"text": "蝴蝶跳舞", "correct": false, "icon": ""}, {"text": "漂亮的蝴蝶", "correct": false, "icon": ""}]','蝴蝶起舞',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"举世闻名" 的意思是？','[{"text": "全世界都知道", "correct": true, "icon": ""}, {"text": "大吵大闹", "correct": false, "icon": ""}, {"text": "很出名吗", "correct": false, "icon": ""}, {"text": "举世无双", "correct": false, "icon": ""}]','全世界都知道',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"不约而同" 的意思是？','[{"text": "没有商量却一致", "correct": true, "icon": ""}, {"text": "约好时间", "correct": false, "icon": ""}, {"text": "不守约定", "correct": false, "icon": ""}, {"text": "同时到达", "correct": false, "icon": ""}]','没有商量却一致',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"目不转睛" 的意思是？','[{"text": "注意力很集中", "correct": true, "icon": ""}, {"text": "眼睛不动", "correct": false, "icon": ""}, {"text": "闭着眼睛", "correct": false, "icon": ""}, {"text": "东张西望", "correct": false, "icon": ""}]','注意力很集中',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"奋不顾身" 形容？','[{"text": "不顾自身安危", "correct": true, "icon": ""}, {"text": "很勇敢吗", "correct": false, "icon": ""}, {"text": "身体很好", "correct": false, "icon": ""}, {"text": "跑步很快", "correct": false, "icon": ""}]','不顾自身安危',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','修改病句："我断定他可能是对的" →','[{"text": "我断定他是对的", "correct": true, "icon": ""}, {"text": "我可能断定他对", "correct": false, "icon": ""}, {"text": "他可能对我断定", "correct": false, "icon": ""}, {"text": "我断定他可能是对的", "correct": false, "icon": ""}]','我断定他是对的',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"兴致勃勃" 的意思是？','[{"text": "兴趣很浓", "correct": true, "icon": ""}, {"text": "生气勃勃", "correct": false, "icon": ""}, {"text": "匆匆忙忙", "correct": false, "icon": ""}, {"text": "慢条斯理", "correct": false, "icon": ""}]','兴趣很浓',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"持之以恒" 的意思是？','[{"text": "长期坚持", "correct": true, "icon": ""}, {"text": "经常锻炼", "correct": false, "icon": ""}, {"text": "持之以恒", "correct": false, "icon": ""}, {"text": "坚持不懈", "correct": false, "icon": ""}]','长期坚持',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','（ ）天再冷，他（ ）坚持锻炼','[{"text": "无论...都", "correct": true, "icon": ""}, {"text": "不但...而且", "correct": false, "icon": ""}, {"text": "只要...就", "correct": false, "icon": ""}, {"text": "因为...所以", "correct": false, "icon": ""}]','无论...都',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"心旷神怡" 形容？','[{"text": "心情舒畅", "correct": true, "icon": ""}, {"text": "心情紧张", "correct": false, "icon": ""}, {"text": "心平气和", "correct": false, "icon": ""}, {"text": "心神不宁", "correct": false, "icon": ""}]','心情舒畅',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"垂头丧气" 的反义词是？','[{"text": "兴高采烈", "correct": true, "icon": ""}, {"text": "没精打采", "correct": false, "icon": ""}, {"text": "灰心丧气", "correct": false, "icon": ""}, {"text": "垂头丧气", "correct": false, "icon": ""}]','兴高采烈',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','缩句："聪明的猴子在树上灵活地跳来跳去" →','[{"text": "猴子跳", "correct": true, "icon": ""}, {"text": "猴子在树上", "correct": false, "icon": ""}, {"text": "聪明的猴子", "correct": false, "icon": ""}, {"text": "猴子跳来跳去", "correct": false, "icon": ""}]','猴子跳',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"络绎不绝" 形容？','[{"text": "来来往往不断", "correct": true, "icon": ""}, {"text": "连续不断说话", "correct": false, "icon": ""}, {"text": "络络大方", "correct": false, "icon": ""}, {"text": "十分热闹", "correct": false, "icon": ""}]','来来往往不断',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','修改病句："他大约用了十分钟左右" →','[{"text": "他大约用了十分钟", "correct": true, "icon": ""}, {"text": "他用了十分钟左右", "correct": false, "icon": ""}, {"text": "他大约左右用了十分钟", "correct": false, "icon": ""}, {"text": "他大约用了左右十分钟", "correct": false, "icon": ""}]','他大约用了十分钟',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"应接不暇" 的意思是？','[{"text": "忙不过来", "correct": true, "icon": ""}, {"text": "接不住", "correct": false, "icon": ""}, {"text": "看得见", "correct": false, "icon": ""}, {"text": "来得及", "correct": false, "icon": ""}]','忙不过来',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"无微不至" 形容？','[{"text": "照顾非常周到", "correct": true, "icon": ""}, {"text": "没有地方", "correct": false, "icon": ""}, {"text": "不够周到", "correct": false, "icon": ""}, {"text": "很微小", "correct": false, "icon": ""}]','照顾非常周到',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','"舍己为人" 形容？','[{"text": "为他人牺牲自己", "correct": true, "icon": ""}, {"text": "自己牺牲", "correct": false, "icon": ""}, {"text": "帮助自己", "correct": false, "icon": ""}, {"text": "自私自利", "correct": false, "icon": ""}]','为他人牺牲自己',1,1,1),
('yuwen','PRIMARY_4','choice','guanlianci','关联词与缩句','缩句："勇敢的消防员在火场中救人" →','[{"text": "消防员救人", "correct": true, "icon": ""}, {"text": "勇敢的消防员", "correct": false, "icon": ""}, {"text": "在火场中", "correct": false, "icon": ""}, {"text": "消防员在火场", "correct": false, "icon": ""}]','消防员救人',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_5 english（过去式与比较级）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"yesterday" 的意思是？','[{"text": "昨天", "correct": true, "icon": ""}, {"text": "今天", "correct": false, "icon": ""}, {"text": "明天", "correct": false, "icon": ""}, {"text": "后天", "correct": false, "icon": ""}]','昨天',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','go 的过去式是？','[{"text": "went", "correct": true, "icon": ""}, {"text": "goed", "correct": false, "icon": ""}, {"text": "going", "correct": false, "icon": ""}, {"text": "gone", "correct": false, "icon": ""}]','went',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','see 的过去式是？','[{"text": "saw", "correct": true, "icon": ""}, {"text": "seed", "correct": false, "icon": ""}, {"text": "seen", "correct": false, "icon": ""}, {"text": "sees", "correct": false, "icon": ""}]','saw',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','eat 的过去式是？','[{"text": "ate", "correct": true, "icon": ""}, {"text": "eated", "correct": false, "icon": ""}, {"text": "eaten", "correct": false, "icon": ""}, {"text": "eats", "correct": false, "icon": ""}]','ate',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"bigger" 表示？','[{"text": "更大的", "correct": true, "icon": ""}, {"text": "最大的", "correct": false, "icon": ""}, {"text": "小的", "correct": false, "icon": ""}, {"text": "更小", "correct": false, "icon": ""}]','更大的',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"taller" 表示？','[{"text": "更高的", "correct": true, "icon": ""}, {"text": "最高的", "correct": false, "icon": ""}, {"text": "矮的", "correct": false, "icon": ""}, {"text": "更矮", "correct": false, "icon": ""}]','更高的',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"bus" 的意思是？','[{"text": "公交车", "correct": true, "icon": ""}, {"text": "火车", "correct": false, "icon": ""}, {"text": "出租车", "correct": false, "icon": ""}, {"text": "地铁", "correct": false, "icon": ""}]','公交车',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"train" 的意思是？','[{"text": "火车", "correct": true, "icon": ""}, {"text": "飞机", "correct": false, "icon": ""}, {"text": "轮船", "correct": false, "icon": ""}, {"text": "汽车", "correct": false, "icon": ""}]','火车',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"plane" 的意思是？','[{"text": "飞机", "correct": true, "icon": ""}, {"text": "火车", "correct": false, "icon": ""}, {"text": "汽车", "correct": false, "icon": ""}, {"text": "轮船", "correct": false, "icon": ""}]','飞机',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"ship" 的意思是？','[{"text": "轮船", "correct": true, "icon": ""}, {"text": "飞机", "correct": false, "icon": ""}, {"text": "火车", "correct": false, "icon": ""}, {"text": "自行车", "correct": false, "icon": ""}]','轮船',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"by bike" 的意思是？','[{"text": "骑自行车", "correct": true, "icon": ""}, {"text": "乘公交", "correct": false, "icon": ""}, {"text": "步行", "correct": false, "icon": ""}, {"text": "坐火车", "correct": false, "icon": ""}]','骑自行车',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"last week" 的意思是？','[{"text": "上周", "correct": true, "icon": ""}, {"text": "下周", "correct": false, "icon": ""}, {"text": "本周", "correct": false, "icon": ""}, {"text": "周末", "correct": false, "icon": ""}]','上周',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"beautiful" 的比较级是？','[{"text": "more beautiful", "correct": true, "icon": ""}, {"text": "beautifuler", "correct": false, "icon": ""}, {"text": "beautifuller", "correct": false, "icon": ""}, {"text": "most beautiful", "correct": false, "icon": ""}]','more beautiful',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"happy" 的比较级是？','[{"text": "happier", "correct": true, "icon": ""}, {"text": "happyer", "correct": false, "icon": ""}, {"text": "more happy", "correct": false, "icon": ""}, {"text": "happiest", "correct": false, "icon": ""}]','happier',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','fly 的过去式是？','[{"text": "flew", "correct": true, "icon": ""}, {"text": "flied", "correct": false, "icon": ""}, {"text": "flown", "correct": false, "icon": ""}, {"text": "flies", "correct": false, "icon": ""}]','flew',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','buy 的过去式是？','[{"text": "bought", "correct": true, "icon": ""}, {"text": "buyed", "correct": false, "icon": ""}, {"text": "buys", "correct": false, "icon": ""}, {"text": "brought", "correct": false, "icon": ""}]','bought',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','take 的过去式是？','[{"text": "took", "correct": true, "icon": ""}, {"text": "taked", "correct": false, "icon": ""}, {"text": "taken", "correct": false, "icon": ""}, {"text": "takes", "correct": false, "icon": ""}]','took',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','make 的过去式是？','[{"text": "made", "correct": true, "icon": ""}, {"text": "maked", "correct": false, "icon": ""}, {"text": "makes", "correct": false, "icon": ""}, {"text": "maden", "correct": false, "icon": ""}]','made',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"heavy" 的比较级是？','[{"text": "heavier", "correct": true, "icon": ""}, {"text": "heavyer", "correct": false, "icon": ""}, {"text": "more heavy", "correct": false, "icon": ""}, {"text": "heaviest", "correct": false, "icon": ""}]','heavier',1,1,1),
('english','PRIMARY_5','choice','past_tense','过去式与比较级','"early" 的比较级是？','[{"text": "earlier", "correct": true, "icon": ""}, {"text": "earlyer", "correct": false, "icon": ""}, {"text": "more early", "correct": false, "icon": ""}, {"text": "earliest", "correct": false, "icon": ""}]','earlier',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_5 math（分数与方程）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_5','choice','fraction','分数与方程','1/3 + 1/3 = ？','[{"text": "2/3", "correct": true, "icon": ""}, {"text": "1/3", "correct": false, "icon": ""}, {"text": "2/6", "correct": false, "icon": ""}, {"text": "1/6", "correct": false, "icon": ""}]','2/3',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','1/2 + 1/4 = ？','[{"text": "3/4", "correct": true, "icon": ""}, {"text": "2/4", "correct": false, "icon": ""}, {"text": "1/4", "correct": false, "icon": ""}, {"text": "3/8", "correct": false, "icon": ""}]','3/4',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','2/5 + 3/5 = ？','[{"text": "1", "correct": true, "icon": ""}, {"text": "5/5", "correct": false, "icon": ""}, {"text": "2/5", "correct": false, "icon": ""}, {"text": "1/5", "correct": false, "icon": ""}]','1',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','5/6 - 1/3 = ？','[{"text": "1/2", "correct": true, "icon": ""}, {"text": "4/6", "correct": false, "icon": ""}, {"text": "1/3", "correct": false, "icon": ""}, {"text": "2/3", "correct": false, "icon": ""}]','1/2',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','3/4 - 1/4 = ？','[{"text": "1/2", "correct": true, "icon": ""}, {"text": "2/4", "correct": false, "icon": ""}, {"text": "1/4", "correct": false, "icon": ""}, {"text": "3/4", "correct": false, "icon": ""}]','1/2',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','正方体体积 = ？','[{"text": "棱长 × 棱长 × 棱长", "correct": true, "icon": ""}, {"text": "长 × 宽", "correct": false, "icon": ""}, {"text": "棱长 × 6", "correct": false, "icon": ""}, {"text": "棱长 × 4", "correct": false, "icon": ""}]','棱长 × 棱长 × 棱长',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','棱长 2 的正方体体积是？','[{"text": "8", "correct": true, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}]','8',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','长方体体积 = ？','[{"text": "长 × 宽 × 高", "correct": true, "icon": ""}, {"text": "长 × 宽", "correct": false, "icon": ""}, {"text": "长 + 宽 + 高", "correct": false, "icon": ""}, {"text": "底 × 高", "correct": false, "icon": ""}]','长 × 宽 × 高',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','解方程：x + 5 = 12，x = ？','[{"text": "7", "correct": true, "icon": ""}, {"text": "17", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}]','7',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','解方程：2x = 18，x = ？','[{"text": "9", "correct": true, "icon": ""}, {"text": "16", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}]','9',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','解方程：x - 7 = 9，x = ？','[{"text": "16", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "15", "correct": false, "icon": ""}]','16',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','解方程：x ÷ 3 = 6，x = ？','[{"text": "18", "correct": true, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}, {"text": "2", "correct": false, "icon": ""}]','18',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','1/2 × 1/3 = ？','[{"text": "1/6", "correct": true, "icon": ""}, {"text": "2/5", "correct": false, "icon": ""}, {"text": "1/5", "correct": false, "icon": ""}, {"text": "2/6", "correct": false, "icon": ""}]','1/6',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','2/3 ÷ 2 = ？','[{"text": "1/3", "correct": true, "icon": ""}, {"text": "4/3", "correct": false, "icon": ""}, {"text": "2/6", "correct": false, "icon": ""}, {"text": "1/6", "correct": false, "icon": ""}]','1/3',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','3/4 × 4/5 = ？','[{"text": "3/5", "correct": true, "icon": ""}, {"text": "12/20", "correct": false, "icon": ""}, {"text": "4/5", "correct": false, "icon": ""}, {"text": "3/4", "correct": false, "icon": ""}]','3/5',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','小数 0.5 等于分数？','[{"text": "1/2", "correct": true, "icon": ""}, {"text": "2/3", "correct": false, "icon": ""}, {"text": "1/5", "correct": false, "icon": ""}, {"text": "3/4", "correct": false, "icon": ""}]','1/2',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','0.25 等于分数？','[{"text": "1/4", "correct": true, "icon": ""}, {"text": "2/5", "correct": false, "icon": ""}, {"text": "1/3", "correct": false, "icon": ""}, {"text": "3/4", "correct": false, "icon": ""}]','1/4',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','1.5 小时 = ？ 分钟','[{"text": "90", "correct": true, "icon": ""}, {"text": "150", "correct": false, "icon": ""}, {"text": "60", "correct": false, "icon": ""}, {"text": "100", "correct": false, "icon": ""}]','90',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','1 升 = ？ 毫升','[{"text": "1000", "correct": true, "icon": ""}, {"text": "100", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "10000", "correct": false, "icon": ""}]','1000',1,1,1),
('math','PRIMARY_5','choice','fraction','分数与方程','解方程：x + 3x = 24，x = ？','[{"text": "6", "correct": true, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}]','6',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_5 yuwen（古诗文与说明方法）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"床前明月光" 的作者是？','[{"text": "李白", "correct": true, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "白居易", "correct": false, "icon": ""}]','李白',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"春眠不觉晓" 的作者是？','[{"text": "孟浩然", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "王昌龄", "correct": false, "icon": ""}]','孟浩然',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"锄禾日当午" 出自《》？','[{"text": "悯农", "correct": true, "icon": ""}, {"text": "静夜思", "correct": false, "icon": ""}, {"text": "春晓", "correct": false, "icon": ""}, {"text": "咏鹅", "correct": false, "icon": ""}]','悯农',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"太阳离我们约1.5亿公里远" 用了什么说明方法？','[{"text": "列数字", "correct": true, "icon": ""}, {"text": "打比方", "correct": false, "icon": ""}, {"text": "举例子", "correct": false, "icon": ""}, {"text": "作比较", "correct": false, "icon": ""}]','列数字',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"举例子" 的说明方法作用是？','[{"text": "使说明更具体", "correct": true, "icon": ""}, {"text": "使说明更生动", "correct": false, "icon": ""}, {"text": "使说明更准确", "correct": false, "icon": ""}, {"text": "使说明更简短", "correct": false, "icon": ""}]','使说明更具体',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"望庐山瀑布" 的作者是？','[{"text": "李白", "correct": true, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "苏轼", "correct": false, "icon": ""}, {"text": "王安石", "correct": false, "icon": ""}]','李白',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"静夜思" 表达了什么情感？','[{"text": "思乡之情", "correct": true, "icon": ""}, {"text": "爱国之情", "correct": false, "icon": ""}, {"text": "喜悦之情", "correct": false, "icon": ""}, {"text": "悲伤之情", "correct": false, "icon": ""}]','思乡之情',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"欲穷千里目，更上一层楼" 出自《》？','[{"text": "登鹳雀楼", "correct": true, "icon": ""}, {"text": "望庐山瀑布", "correct": false, "icon": ""}, {"text": "早发白帝城", "correct": false, "icon": ""}, {"text": "夜书所见", "correct": false, "icon": ""}]','登鹳雀楼',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"少壮不努力" 的下一句是？','[{"text": "老大徒伤悲", "correct": true, "icon": ""}, {"text": "老大空悲切", "correct": false, "icon": ""}, {"text": "白发三千丈", "correct": false, "icon": ""}, {"text": "莫等闲", "correct": false, "icon": ""}]','老大徒伤悲',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"地球像一个大水球" 用了什么说明方法？','[{"text": "打比方", "correct": true, "icon": ""}, {"text": "列数字", "correct": false, "icon": ""}, {"text": "举例子", "correct": false, "icon": ""}, {"text": "作比较", "correct": false, "icon": ""}]','打比方',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"独在异乡为异客" 的作者是？','[{"text": "王维", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "孟浩然", "correct": false, "icon": ""}]','王维',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"每逢佳节倍思亲" 的"佳节"指？','[{"text": "重阳节", "correct": true, "icon": ""}, {"text": "中秋节", "correct": false, "icon": ""}, {"text": "春节", "correct": false, "icon": ""}, {"text": "端午节", "correct": false, "icon": ""}]','重阳节',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"天苍苍，野茫茫" 出自《》？','[{"text": "敕勒歌", "correct": true, "icon": ""}, {"text": "敕勒川", "correct": false, "icon": ""}, {"text": "静夜思", "correct": false, "icon": ""}, {"text": "悯农", "correct": false, "icon": ""}]','敕勒歌',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"桃花潭水深千尺" 用了什么修辞？','[{"text": "夸张", "correct": true, "icon": ""}, {"text": "比喻", "correct": false, "icon": ""}, {"text": "拟人", "correct": false, "icon": ""}, {"text": "排比", "correct": false, "icon": ""}]','夸张',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"飞流直下三千尺" 用了？','[{"text": "夸张", "correct": true, "icon": ""}, {"text": "拟人", "correct": false, "icon": ""}, {"text": "比喻", "correct": false, "icon": ""}, {"text": "设问", "correct": false, "icon": ""}]','夸张',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"疑是银河落九天" 用了？','[{"text": "比喻", "correct": true, "icon": ""}, {"text": "夸张", "correct": false, "icon": ""}, {"text": "拟人", "correct": false, "icon": ""}, {"text": "排比", "correct": false, "icon": ""}]','比喻',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"黄鹤楼送孟浩然之广陵" 的作者是？','[{"text": "李白", "correct": true, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "白居易", "correct": false, "icon": ""}]','李白',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"孤帆远影碧空尽" 表达了？','[{"text": "依依不舍之情", "correct": true, "icon": ""}, {"text": "高兴之情", "correct": false, "icon": ""}, {"text": "愤怒之情", "correct": false, "icon": ""}, {"text": "平静之情", "correct": false, "icon": ""}]','依依不舍之情',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"两个黄鹂鸣翠柳" 的作者是？','[{"text": "杜甫", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "孟浩然", "correct": false, "icon": ""}]','杜甫',1,1,1),
('yuwen','PRIMARY_5','choice','gushi','古诗文与说明方法','"接天莲叶无穷碧" 的作者是？','[{"text": "杨万里", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "苏轼", "correct": false, "icon": ""}]','杨万里',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_6 english（时态综合与最高级）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"tomorrow" 的意思是？','[{"text": "明天", "correct": true, "icon": ""}, {"text": "昨天", "correct": false, "icon": ""}, {"text": "今天", "correct": false, "icon": ""}, {"text": "后天", "correct": false, "icon": ""}]','明天',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','I ___ visit my grandma tomorrow.','[{"text": "will", "correct": true, "icon": ""}, {"text": "am", "correct": false, "icon": ""}, {"text": "was", "correct": false, "icon": ""}, {"text": "did", "correct": false, "icon": ""}]','will',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"will" 表示？','[{"text": "将要", "correct": true, "icon": ""}, {"text": "已经", "correct": false, "icon": ""}, {"text": "正在", "correct": false, "icon": ""}, {"text": "经常", "correct": false, "icon": ""}]','将要',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"best" 是哪个词的最高级？','[{"text": "good", "correct": true, "icon": ""}, {"text": "well", "correct": false, "icon": ""}, {"text": "bad", "correct": false, "icon": ""}, {"text": "much", "correct": false, "icon": ""}]','good',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"tallest" 表示？','[{"text": "最高的", "correct": true, "icon": ""}, {"text": "更高的", "correct": false, "icon": ""}, {"text": "很矮的", "correct": false, "icon": ""}, {"text": "更矮的", "correct": false, "icon": ""}]','最高的',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"faster" 表示？','[{"text": "更快的", "correct": true, "icon": ""}, {"text": "最快的", "correct": false, "icon": ""}, {"text": "很慢的", "correct": false, "icon": ""}, {"text": "更慢的", "correct": false, "icon": ""}]','更快的',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','She ___ to school every day.','[{"text": "goes", "correct": true, "icon": ""}, {"text": "go", "correct": false, "icon": ""}, {"text": "going", "correct": false, "icon": ""}, {"text": "went", "correct": false, "icon": ""}]','goes',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','They ___ playing football now.','[{"text": "are", "correct": true, "icon": ""}, {"text": "is", "correct": false, "icon": ""}, {"text": "was", "correct": false, "icon": ""}, {"text": "do", "correct": false, "icon": ""}]','are',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"already" 常搭配什么时态？','[{"text": "现在完成时", "correct": true, "icon": ""}, {"text": "一般过去时", "correct": false, "icon": ""}, {"text": "一般现在时", "correct": false, "icon": ""}, {"text": "将来时", "correct": false, "icon": ""}]','现在完成时',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"have been to" 表示？','[{"text": "去过", "correct": true, "icon": ""}, {"text": "正在去", "correct": false, "icon": ""}, {"text": "将要", "correct": false, "icon": ""}, {"text": "没去过", "correct": false, "icon": ""}]','去过',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','The elephant is the ___ animal.','[{"text": "biggest", "correct": true, "icon": ""}, {"text": "bigger", "correct": false, "icon": ""}, {"text": "big", "correct": false, "icon": ""}, {"text": "biggest", "correct": true, "icon": ""}]','biggest',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','A is ___ than B.','[{"text": "bigger", "correct": true, "icon": ""}, {"text": "biggest", "correct": false, "icon": ""}, {"text": "big", "correct": false, "icon": ""}, {"text": "the big", "correct": false, "icon": ""}]','bigger',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"last summer" 表示？','[{"text": "去年夏天", "correct": true, "icon": ""}, {"text": "今年夏天", "correct": false, "icon": ""}, {"text": "明年夏天", "correct": false, "icon": ""}, {"text": "上周", "correct": false, "icon": ""}]','去年夏天',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','I ___ to Beijing last year.','[{"text": "went", "correct": true, "icon": ""}, {"text": "go", "correct": false, "icon": ""}, {"text": "will go", "correct": false, "icon": ""}, {"text": "goes", "correct": false, "icon": ""}]','went',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"will + 动词原形" 表示？','[{"text": "一般将来时", "correct": true, "icon": ""}, {"text": "一般过去时", "correct": false, "icon": ""}, {"text": "现在完成时", "correct": false, "icon": ""}, {"text": "现在进行时", "correct": false, "icon": ""}]','一般将来时',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"am/is/are + doing" 表示？','[{"text": "现在进行时", "correct": true, "icon": ""}, {"text": "一般将来时", "correct": false, "icon": ""}, {"text": "一般过去时", "correct": false, "icon": ""}, {"text": "现在完成时", "correct": false, "icon": ""}]','现在进行时',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"have done" 表示？','[{"text": "现在完成时", "correct": true, "icon": ""}, {"text": "一般过去时", "correct": false, "icon": ""}, {"text": "现在进行时", "correct": false, "icon": ""}, {"text": "一般将来时", "correct": false, "icon": ""}]','现在完成时',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','He is tall, ___?（反义疑问）','[{"text": "isn''t he", "correct": true, "icon": ""}, {"text": "is he", "correct": false, "icon": ""}, {"text": "doesn''t he", "correct": false, "icon": ""}, {"text": "was he", "correct": false, "icon": ""}]','isn''t he',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"more" 是比较级还是最高级标志？','[{"text": "比较级", "correct": true, "icon": ""}, {"text": "最高级", "correct": false, "icon": ""}, {"text": "一样", "correct": false, "icon": ""}, {"text": "都不", "correct": false, "icon": ""}]','比较级',1,1,1),
('english','PRIMARY_6','choice','tense_grade6','时态综合与最高级','"the most" 是比较级还是最高级标志？','[{"text": "最高级", "correct": true, "icon": ""}, {"text": "比较级", "correct": false, "icon": ""}, {"text": "一样", "correct": false, "icon": ""}, {"text": "都不", "correct": false, "icon": ""}]','最高级',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_6 math（百分数与圆）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_6','choice','percent','百分数与圆','50% 等于分数？','[{"text": "1/2", "correct": true, "icon": ""}, {"text": "1/4", "correct": false, "icon": ""}, {"text": "2/3", "correct": false, "icon": ""}, {"text": "3/4", "correct": false, "icon": ""}]','1/2',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','25% 等于小数？','[{"text": "0.25", "correct": true, "icon": ""}, {"text": "0.5", "correct": false, "icon": ""}, {"text": "2.5", "correct": false, "icon": ""}, {"text": "0.025", "correct": false, "icon": ""}]','0.25',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','100 的 20% 是？','[{"text": "20", "correct": true, "icon": ""}, {"text": "80", "correct": false, "icon": ""}, {"text": "200", "correct": false, "icon": ""}, {"text": "2", "correct": false, "icon": ""}]','20',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','圆的周长公式是？','[{"text": "2πr", "correct": true, "icon": ""}, {"text": "πr²", "correct": false, "icon": ""}, {"text": "πd²", "correct": false, "icon": ""}, {"text": "2πd", "correct": false, "icon": ""}]','2πr',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','圆的面积公式是？','[{"text": "πr²", "correct": true, "icon": ""}, {"text": "2πr", "correct": false, "icon": ""}, {"text": "πd", "correct": false, "icon": ""}, {"text": "2πd", "correct": false, "icon": ""}]','πr²',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','半径 3 的圆面积约是？（π取3.14）','[{"text": "28.26", "correct": true, "icon": ""}, {"text": "18.84", "correct": false, "icon": ""}, {"text": "9.42", "correct": false, "icon": ""}, {"text": "28.26", "correct": true, "icon": ""}]','28.26',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','3 : 5 = ？ : 10','[{"text": "6", "correct": true, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','比例的基本性质是？','[{"text": "两内项积 = 两外项积", "correct": true, "icon": ""}, {"text": "两内项和 = 两外项和", "correct": false, "icon": ""}, {"text": "两内项积 = 1", "correct": false, "icon": ""}, {"text": "两外项积 = 1", "correct": false, "icon": ""}]','两内项积 = 两外项积',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','8 : 4 = 2 : 1 正确吗？','[{"text": "正确", "correct": true, "icon": ""}, {"text": "错误", "correct": false, "icon": ""}, {"text": "不确定", "correct": false, "icon": ""}, {"text": "不知道", "correct": false, "icon": ""}]','正确',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','90 的 50% 是？','[{"text": "45", "correct": true, "icon": ""}, {"text": "50", "correct": false, "icon": ""}, {"text": "40", "correct": false, "icon": ""}, {"text": "55", "correct": false, "icon": ""}]','45',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','一件衣服原价 100 元打 8 折是？','[{"text": "80元", "correct": false, "icon": ""}, {"text": "20元", "correct": false, "icon": ""}, {"text": "90元", "correct": false, "icon": ""}, {"text": "100元", "correct": false, "icon": ""}]','80 元',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','圆的直径是半径的？','[{"text": "2倍", "correct": false, "icon": ""}, {"text": "3倍", "correct": false, "icon": ""}, {"text": "一半", "correct": false, "icon": ""}, {"text": "4倍", "correct": false, "icon": ""}]','2 倍',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','半径 4 的圆周长约是？（π取3.14）','[{"text": "25.12", "correct": true, "icon": ""}, {"text": "50.24", "correct": false, "icon": ""}, {"text": "12.56", "correct": false, "icon": ""}, {"text": "28.12", "correct": false, "icon": ""}]','25.12',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','60% 等于分数？','[{"text": "3/5", "correct": true, "icon": ""}, {"text": "2/5", "correct": false, "icon": ""}, {"text": "4/5", "correct": false, "icon": ""}, {"text": "1/5", "correct": false, "icon": ""}]','3/5',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','200 的 15% 是？','[{"text": "30", "correct": true, "icon": ""}, {"text": "15", "correct": false, "icon": ""}, {"text": "300", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}]','30',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','比例 2 : 3 = 4 : x，x = ？','[{"text": "6", "correct": true, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','圆的半径扩大 2 倍，面积扩大？','[{"text": "4倍", "correct": false, "icon": ""}, {"text": "2倍", "correct": false, "icon": ""}, {"text": "8倍", "correct": false, "icon": ""}, {"text": "16倍", "correct": false, "icon": ""}]','4 倍',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','0.75 = ？%','[{"text": "75%", "correct": true, "icon": ""}, {"text": "7.5%", "correct": false, "icon": ""}, {"text": "750%", "correct": false, "icon": ""}, {"text": "0.75%", "correct": false, "icon": ""}]','75%',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','250 的 40% 是？','[{"text": "100", "correct": true, "icon": ""}, {"text": "40", "correct": false, "icon": ""}, {"text": "250", "correct": false, "icon": ""}, {"text": "150", "correct": false, "icon": ""}]','100',1,1,1),
('math','PRIMARY_6','choice','percent','百分数与圆','半圆的面积是整圆面积的？','[{"text": "一半", "correct": true, "icon": ""}, {"text": "两倍", "correct": false, "icon": ""}, {"text": "四分之一", "correct": false, "icon": ""}, {"text": "一样大", "correct": false, "icon": ""}]','一半',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_6 yuwen（文言文与文学常识）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"学而时习之" 出自《》？','[{"text": "论语", "correct": true, "icon": ""}, {"text": "孟子", "correct": false, "icon": ""}, {"text": "大学", "correct": false, "icon": ""}, {"text": "中庸", "correct": false, "icon": ""}]','论语',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"三人行，必有我师焉" 出自？','[{"text": "论语", "correct": true, "icon": ""}, {"text": "孟子", "correct": false, "icon": ""}, {"text": "诗经", "correct": false, "icon": ""}, {"text": "春秋", "correct": false, "icon": ""}]','论语',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"温故而知新" 的意思是？','[{"text": "温习旧知识能有新体会", "correct": true, "icon": ""}, {"text": "学习要勤快", "correct": false, "icon": ""}, {"text": "记住新知识", "correct": false, "icon": ""}, {"text": "复习很累", "correct": false, "icon": ""}]','温习旧知识能有新体会',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"己所不欲" 的下一句是？','[{"text": "勿施于人", "correct": true, "icon": ""}, {"text": "施于人勿", "correct": false, "icon": ""}, {"text": "勿欲于己", "correct": false, "icon": ""}, {"text": "己所不能", "correct": false, "icon": ""}]','勿施于人',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','《论语》是谁的言论集？','[{"text": "孔子及其弟子", "correct": true, "icon": ""}, {"text": "孟子", "correct": false, "icon": ""}, {"text": "老子", "correct": false, "icon": ""}, {"text": "庄子", "correct": false, "icon": ""}]','孔子及其弟子',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"人之初，性本善" 出自《》？','[{"text": "三字经", "correct": true, "icon": ""}, {"text": "百家姓", "correct": false, "icon": ""}, {"text": "千字文", "correct": false, "icon": ""}, {"text": "论语", "correct": false, "icon": ""}]','三字经',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"举头望明月" 的下一句是？','[{"text": "低头思故乡", "correct": true, "icon": ""}, {"text": "低头看月亮", "correct": false, "icon": ""}, {"text": "举杯邀明月", "correct": false, "icon": ""}, {"text": "低头思故人", "correct": false, "icon": ""}]','低头思故乡',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"草长莺飞二月天" 出自《》？','[{"text": "村居", "correct": true, "icon": ""}, {"text": "春晓", "correct": false, "icon": ""}, {"text": "咏柳", "correct": false, "icon": ""}, {"text": "绝句", "correct": false, "icon": ""}]','村居',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','《红楼梦》的作者是？','[{"text": "曹雪芹", "correct": true, "icon": ""}, {"text": "吴承恩", "correct": false, "icon": ""}, {"text": "施耐庵", "correct": false, "icon": ""}, {"text": "罗贯中", "correct": false, "icon": ""}]','曹雪芹',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','《西游记》的作者是？','[{"text": "吴承恩", "correct": true, "icon": ""}, {"text": "曹雪芹", "correct": false, "icon": ""}, {"text": "罗贯中", "correct": false, "icon": ""}, {"text": "施耐庵", "correct": false, "icon": ""}]','吴承恩',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','《三国演义》的作者是？','[{"text": "罗贯中", "correct": true, "icon": ""}, {"text": "施耐庵", "correct": false, "icon": ""}, {"text": "吴承恩", "correct": false, "icon": ""}, {"text": "曹雪芹", "correct": false, "icon": ""}]','罗贯中',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','《水浒传》的作者是？','[{"text": "施耐庵", "correct": true, "icon": ""}, {"text": "罗贯中", "correct": false, "icon": ""}, {"text": "吴承恩", "correct": false, "icon": ""}, {"text": "曹雪芹", "correct": false, "icon": ""}]','施耐庵',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"大江东去，浪淘尽" 的作者是？','[{"text": "苏轼", "correct": true, "icon": ""}, {"text": "辛弃疾", "correct": false, "icon": ""}, {"text": "李清照", "correct": false, "icon": ""}, {"text": "陆游", "correct": false, "icon": ""}]','苏轼',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','《岳阳楼记》的作者是？','[{"text": "范仲淹", "correct": true, "icon": ""}, {"text": "欧阳修", "correct": false, "icon": ""}, {"text": "王安石", "correct": false, "icon": ""}, {"text": "柳宗元", "correct": false, "icon": ""}]','范仲淹',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','作文"开门见山" 是指？','[{"text": "开头直接点题", "correct": true, "icon": ""}, {"text": "打开门看山", "correct": false, "icon": ""}, {"text": "开头写景色", "correct": false, "icon": ""}, {"text": "结尾点题", "correct": false, "icon": ""}]','开头直接点题',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"千山鸟飞绝" 的下一句是？','[{"text": "万径人踪灭", "correct": true, "icon": ""}, {"text": "万里人踪灭", "correct": false, "icon": ""}, {"text": "万径鸟飞绝", "correct": false, "icon": ""}, {"text": "千里冰封", "correct": false, "icon": ""}]','万径人踪灭',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"随风潜入夜" 的下一句是？','[{"text": "润物细无声", "correct": true, "icon": ""}, {"text": "润物大无声", "correct": false, "icon": ""}, {"text": "随风细无声", "correct": false, "icon": ""}, {"text": "夜来风雨声", "correct": false, "icon": ""}]','润物细无声',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"少小离家老大回" 的作者是？','[{"text": "贺知章", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "白居易", "correct": false, "icon": ""}]','贺知章',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"落红不是无情物" 的下一句是？','[{"text": "化作春泥更护花", "correct": true, "icon": ""}, {"text": "化作春泥更护树", "correct": false, "icon": ""}, {"text": "落红有意有情", "correct": false, "icon": ""}, {"text": "春泥更护花", "correct": false, "icon": ""}]','化作春泥更护花',1,1,1),
('yuwen','PRIMARY_6','choice','wenyan','文言文与文学常识','"故人西辞黄鹤楼" 的作者是？','[{"text": "李白", "correct": true, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "孟浩然", "correct": false, "icon": ""}]','李白',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);-- ============================================================
-- ★ v50 题库扩充：2-6 年级每科再补 20 题（覆盖全部知识点组）
--   共 360 题；幂等：唯一索引 uk_ques_subject_group_prompt 防重复
-- ============================================================

-- PRIMARY_2 english（农场动物与衣物）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"cow" 的意思是？','[{"text": "奶牛", "correct": true, "icon": ""}, {"text": "马", "correct": false, "icon": ""}, {"text": "羊", "correct": false, "icon": ""}, {"text": "猪", "correct": false, "icon": ""}]','奶牛',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"horse" 的意思是？','[{"text": "马", "correct": true, "icon": ""}, {"text": "牛", "correct": false, "icon": ""}, {"text": "羊", "correct": false, "icon": ""}, {"text": "驴", "correct": false, "icon": ""}]','马',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"sheep" 的意思是？','[{"text": "绵羊", "correct": true, "icon": ""}, {"text": "山羊", "correct": false, "icon": ""}, {"text": "牛", "correct": false, "icon": ""}, {"text": "马", "correct": false, "icon": ""}]','绵羊',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"duck" 的意思是？','[{"text": "鸭子", "correct": true, "icon": ""}, {"text": "鸡", "correct": false, "icon": ""}, {"text": "鹅", "correct": false, "icon": ""}, {"text": "鸽子", "correct": false, "icon": ""}]','鸭子',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"chicken" 的意思是？','[{"text": "鸡", "correct": true, "icon": ""}, {"text": "鸭", "correct": false, "icon": ""}, {"text": "鹅", "correct": false, "icon": ""}, {"text": "鸟", "correct": false, "icon": ""}]','鸡',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"pig" 的意思是？','[{"text": "猪", "correct": true, "icon": ""}, {"text": "牛", "correct": false, "icon": ""}, {"text": "羊", "correct": false, "icon": ""}, {"text": "狗", "correct": false, "icon": ""}]','猪',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"shirt" 的意思是？','[{"text": "衬衫", "correct": true, "icon": ""}, {"text": "外套", "correct": false, "icon": ""}, {"text": "裙子", "correct": false, "icon": ""}, {"text": "裤子", "correct": false, "icon": ""}]','衬衫',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"coat" 的意思是？','[{"text": "外套", "correct": true, "icon": ""}, {"text": "衬衫", "correct": false, "icon": ""}, {"text": "毛衣", "correct": false, "icon": ""}, {"text": "帽子", "correct": false, "icon": ""}]','外套',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"dress" 的意思是？','[{"text": "连衣裙", "correct": true, "icon": ""}, {"text": "短裤", "correct": false, "icon": ""}, {"text": "袜子", "correct": false, "icon": ""}, {"text": "鞋子", "correct": false, "icon": ""}]','连衣裙',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"skirt" 的意思是？','[{"text": "短裙", "correct": true, "icon": ""}, {"text": "衬衫", "correct": false, "icon": ""}, {"text": "外套", "correct": false, "icon": ""}, {"text": "帽子", "correct": false, "icon": ""}]','短裙',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"hat" 的意思是？','[{"text": "帽子", "correct": true, "icon": ""}, {"text": "手套", "correct": false, "icon": ""}, {"text": "围巾", "correct": false, "icon": ""}, {"text": "袜子", "correct": false, "icon": ""}]','帽子',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"shoes" 的意思是？','[{"text": "鞋子", "correct": true, "icon": ""}, {"text": "袜子", "correct": false, "icon": ""}, {"text": "帽子", "correct": false, "icon": ""}, {"text": "手套", "correct": false, "icon": ""}]','鞋子',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"socks" 的意思是？','[{"text": "袜子", "correct": true, "icon": ""}, {"text": "鞋子", "correct": false, "icon": ""}, {"text": "裤子", "correct": false, "icon": ""}, {"text": "帽子", "correct": false, "icon": ""}]','袜子',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"pants" 的意思是？','[{"text": "裤子", "correct": true, "icon": ""}, {"text": "衬衫", "correct": false, "icon": ""}, {"text": "裙子", "correct": false, "icon": ""}, {"text": "外套", "correct": false, "icon": ""}]','裤子',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"sweater" 的意思是？','[{"text": "毛衣", "correct": true, "icon": ""}, {"text": "外套", "correct": false, "icon": ""}, {"text": "衬衫", "correct": false, "icon": ""}, {"text": "连衣裙", "correct": false, "icon": ""}]','毛衣',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"gloves" 的意思是？','[{"text": "手套", "correct": true, "icon": ""}, {"text": "袜子", "correct": false, "icon": ""}, {"text": "帽子", "correct": false, "icon": ""}, {"text": "围巾", "correct": false, "icon": ""}]','手套',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"twenty-one" 表示数字？','[{"text": "21", "correct": true, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "22", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}]','21',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"thirty" 表示数字？','[{"text": "30", "correct": true, "icon": ""}, {"text": "13", "correct": false, "icon": ""}, {"text": "33", "correct": false, "icon": ""}, {"text": "20", "correct": false, "icon": ""}]','30',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"forty" 表示数字？','[{"text": "40", "correct": true, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "44", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}]','40',1,1,1),
('english','PRIMARY_2','choice','farm_clothes','农场动物与衣物','"Tuesday" 的意思是？','[{"text": "星期二", "correct": true, "icon": ""}, {"text": "星期四", "correct": false, "icon": ""}, {"text": "星期三", "correct": false, "icon": ""}, {"text": "星期六", "correct": false, "icon": ""}]','星期二',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_2 math（角的认识与长度单位）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','三角板上最大的角是？','[{"text": "直角", "correct": true, "icon": ""}, {"text": "锐角", "correct": false, "icon": ""}, {"text": "钝角", "correct": false, "icon": ""}, {"text": "平角", "correct": false, "icon": ""}]','直角',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','比直角小的角叫？','[{"text": "锐角", "correct": true, "icon": ""}, {"text": "钝角", "correct": false, "icon": ""}, {"text": "直角", "correct": false, "icon": ""}, {"text": "平角", "correct": false, "icon": ""}]','锐角',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','比直角大的角叫？','[{"text": "钝角", "correct": true, "icon": ""}, {"text": "锐角", "correct": false, "icon": ""}, {"text": "直角", "correct": false, "icon": ""}, {"text": "周角", "correct": false, "icon": ""}]','钝角',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','1 米 = ？ 厘米','[{"text": "100", "correct": true, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "1000", "correct": false, "icon": ""}, {"text": "50", "correct": false, "icon": ""}]','100',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','1 分米 = ？ 厘米','[{"text": "10", "correct": true, "icon": ""}, {"text": "100", "correct": false, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "1000", "correct": false, "icon": ""}]','10',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','一支铅笔大约长？','[{"text": "18厘米", "correct": false, "icon": ""}, {"text": "18米", "correct": false, "icon": ""}, {"text": "1米", "correct": false, "icon": ""}, {"text": "18毫米", "correct": false, "icon": ""}]','18 厘米',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','黑板大约长？','[{"text": "4米", "correct": false, "icon": ""}, {"text": "4厘米", "correct": false, "icon": ""}, {"text": "40米", "correct": false, "icon": ""}, {"text": "4分米", "correct": false, "icon": ""}]','4 米',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','13 ÷ 4 = ？（有余数）','[{"text": "3余1", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "4余1", "correct": false, "icon": ""}, {"text": "2余5", "correct": false, "icon": ""}]','3 余 1',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','20 ÷ 6 = ？','[{"text": "3余2", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "2余6", "correct": false, "icon": ""}]','3 余 2',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','直角是几度？','[{"text": "90度", "correct": false, "icon": ""}, {"text": "180度", "correct": false, "icon": ""}, {"text": "45度", "correct": false, "icon": ""}, {"text": "60度", "correct": false, "icon": ""}]','90 度',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','教室门的高度约？','[{"text": "2米", "correct": false, "icon": ""}, {"text": "2厘米", "correct": false, "icon": ""}, {"text": "20米", "correct": false, "icon": ""}, {"text": "2分米", "correct": false, "icon": ""}]','2 米',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','27 ÷ 5 = ？（有余数）','[{"text": "5余2", "correct": false, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "4余3", "correct": false, "icon": ""}]','5 余 2',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','1 千米 = ？ 米','[{"text": "1000", "correct": true, "icon": ""}, {"text": "100", "correct": false, "icon": ""}, {"text": "10000", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}]','1000',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','1 厘米 = ？ 毫米','[{"text": "10", "correct": true, "icon": ""}, {"text": "100", "correct": false, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "1000", "correct": false, "icon": ""}]','10',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','一个角有（ ）个顶点','[{"text": "1", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}]','1',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','三角形有（ ）个角','[{"text": "3", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "1", "correct": false, "icon": ""}]','3',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','34 ÷ 7 = ？（有余数）','[{"text": "4余6", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "4余5", "correct": false, "icon": ""}]','4 余 6',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','18 ÷ 4 = ？（有余数）','[{"text": "4余2", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "5余3", "correct": false, "icon": ""}, {"text": "3余6", "correct": false, "icon": ""}]','4 余 2',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','钝角三角形有（ ）个钝角','[{"text": "1", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}]','1',1,1,1),
('math','PRIMARY_2','choice','angle_length','角的认识与长度单位','锐角三角形有（ ）个锐角','[{"text": "3", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}]','3',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_2 yuwen（句子仿写与偏旁）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"把"字句：我吃完了苹果 → 我（ ）苹果吃完了','[{"text": "把", "correct": true, "icon": ""}, {"text": "被", "correct": false, "icon": ""}, {"text": "让", "correct": false, "icon": ""}, {"text": "给", "correct": false, "icon": ""}]','把',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"被"字句：风吹走了帽子 → 帽子（ ）风吹走了','[{"text": "被", "correct": true, "icon": ""}, {"text": "把", "correct": false, "icon": ""}, {"text": "让", "correct": false, "icon": ""}, {"text": "给", "correct": false, "icon": ""}]','被',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"小雨点在跳舞" 用了什么修辞？','[{"text": "拟人", "correct": true, "icon": ""}, {"text": "比喻", "correct": false, "icon": ""}, {"text": "夸张", "correct": false, "icon": ""}, {"text": "排比", "correct": false, "icon": ""}]','拟人',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"小鸟在枝头歌唱" 用了什么修辞？','[{"text": "拟人", "correct": true, "icon": ""}, {"text": "比喻", "correct": false, "icon": ""}, {"text": "排比", "correct": false, "icon": ""}, {"text": "反问", "correct": false, "icon": ""}]','拟人',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"弯弯的月亮像小船" 用了什么修辞？','[{"text": "比喻", "correct": true, "icon": ""}, {"text": "拟人", "correct": false, "icon": ""}, {"text": "夸张", "correct": false, "icon": ""}, {"text": "设问", "correct": false, "icon": ""}]','比喻',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','带"三点水"的字大多和什么有关？','[{"text": "水", "correct": true, "icon": ""}, {"text": "火", "correct": false, "icon": ""}, {"text": "木", "correct": false, "icon": ""}, {"text": "土", "correct": false, "icon": ""}]','水',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','带"提手旁"的字大多和什么有关？','[{"text": "手", "correct": true, "icon": ""}, {"text": "脚", "correct": false, "icon": ""}, {"text": "水", "correct": false, "icon": ""}, {"text": "木", "correct": false, "icon": ""}]','手',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','带"木字旁"的字大多和什么有关？','[{"text": "树木", "correct": true, "icon": ""}, {"text": "水", "correct": false, "icon": ""}, {"text": "金属", "correct": false, "icon": ""}, {"text": "土地", "correct": false, "icon": ""}]','树木',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"望庐山瀑布" 的作者是？','[{"text": "李白", "correct": true, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "白居易", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}]','李白',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"白日依山尽" 的作者是？','[{"text": "王之涣", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "孟浩然", "correct": false, "icon": ""}]','王之涣',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"危楼高百尺" 的下一句是？','[{"text": "手可摘星辰", "correct": true, "icon": ""}, {"text": "手可摘月亮", "correct": false, "icon": ""}, {"text": "高处不胜寒", "correct": false, "icon": ""}, {"text": "疑是银河落九天", "correct": false, "icon": ""}]','手可摘星辰',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"春种一粒粟" 的下一句是？','[{"text": "秋收万颗子", "correct": true, "icon": ""}, {"text": "秋收一颗子", "correct": false, "icon": ""}, {"text": "春收万颗子", "correct": false, "icon": ""}, {"text": "粒粒皆辛苦", "correct": false, "icon": ""}]','秋收万颗子',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"芝麻开花——" 歇后语后一句是？','[{"text": "节节高", "correct": true, "icon": ""}, {"text": "步步高", "correct": false, "icon": ""}, {"text": "层层高", "correct": false, "icon": ""}, {"text": "节节低", "correct": false, "icon": ""}]','节节高',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"竹篮打水——" 后一句是？','[{"text": "一场空", "correct": true, "icon": ""}, {"text": "两场空", "correct": false, "icon": ""}, {"text": "白忙活", "correct": false, "icon": ""}, {"text": "全落空", "correct": false, "icon": ""}]','一场空',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"十五个吊桶打水——" 后一句是？','[{"text": "七上八下", "correct": true, "icon": ""}, {"text": "七下八上", "correct": false, "icon": ""}, {"text": "十拿九稳", "correct": false, "icon": ""}, {"text": "心乱如麻", "correct": false, "icon": ""}]','七上八下',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','照样子写句子：太阳升起来了，像（ ）','[{"text": "一个大火球", "correct": true, "icon": ""}, {"text": "一个圆盘", "correct": false, "icon": ""}, {"text": "一盏灯", "correct": false, "icon": ""}, {"text": "一面镜子", "correct": false, "icon": ""}]','一个大火球',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"月字旁"的字大多和什么有关？','[{"text": "身体部位", "correct": true, "icon": ""}, {"text": "月亮", "correct": false, "icon": ""}, {"text": "时间", "correct": false, "icon": ""}, {"text": "天气", "correct": false, "icon": ""}]','身体部位',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"心字底"的字大多和什么有关？','[{"text": "心理活动", "correct": true, "icon": ""}, {"text": "心脏", "correct": false, "icon": ""}, {"text": "心情", "correct": false, "icon": ""}, {"text": "思想", "correct": false, "icon": ""}]','心理活动',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"遥知不是雪" 的下一句是？','[{"text": "为有暗香来", "correct": true, "icon": ""}, {"text": "凌寒独自开", "correct": false, "icon": ""}, {"text": "雪却输梅一段香", "correct": false, "icon": ""}, {"text": "遥看瀑布挂前川", "correct": false, "icon": ""}]','为有暗香来',1,1,1),
('yuwen','PRIMARY_2','choice','sentence_liangci','句子仿写与偏旁','"飞流直下三千尺" 出自哪首诗？','[{"text": "望庐山瀑布", "correct": true, "icon": ""}, {"text": "静夜思", "correct": false, "icon": ""}, {"text": "早发白帝城", "correct": false, "icon": ""}, {"text": "登鹳雀楼", "correct": false, "icon": ""}]','望庐山瀑布',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_3 english（食物饮料与运动）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"vegetables" 的意思是？','[{"text": "蔬菜", "correct": true, "icon": ""}, {"text": "水果", "correct": false, "icon": ""}, {"text": "米饭", "correct": false, "icon": ""}, {"text": "面包", "correct": false, "icon": ""}]','蔬菜',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"chicken" 作为食物意思是？','[{"text": "鸡肉", "correct": true, "icon": ""}, {"text": "鸡蛋", "correct": false, "icon": ""}, {"text": "鸭肉", "correct": false, "icon": ""}, {"text": "牛肉", "correct": false, "icon": ""}]','鸡肉',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"juice" 的意思是？','[{"text": "果汁", "correct": true, "icon": ""}, {"text": "牛奶", "correct": false, "icon": ""}, {"text": "可乐", "correct": false, "icon": ""}, {"text": "水", "correct": false, "icon": ""}]','果汁',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"tea" 的意思是？','[{"text": "茶", "correct": true, "icon": ""}, {"text": "咖啡", "correct": false, "icon": ""}, {"text": "牛奶", "correct": false, "icon": ""}, {"text": "果汁", "correct": false, "icon": ""}]','茶',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"fish" 作为食物意思是？','[{"text": "鱼肉", "correct": true, "icon": ""}, {"text": "虾", "correct": false, "icon": ""}, {"text": "蟹", "correct": false, "icon": ""}, {"text": "鸡肉", "correct": false, "icon": ""}]','鱼肉',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"run" 的意思是？','[{"text": "跑步", "correct": true, "icon": ""}, {"text": "跳", "correct": false, "icon": ""}, {"text": "游泳", "correct": false, "icon": ""}, {"text": "走", "correct": false, "icon": ""}]','跑步',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"jump" 的意思是？','[{"text": "跳", "correct": true, "icon": ""}, {"text": "跑", "correct": false, "icon": ""}, {"text": "走", "correct": false, "icon": ""}, {"text": "爬", "correct": false, "icon": ""}]','跳',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"swim" 的意思是？','[{"text": "游泳", "correct": true, "icon": ""}, {"text": "跑步", "correct": false, "icon": ""}, {"text": "跳高", "correct": false, "icon": ""}, {"text": "打球", "correct": false, "icon": ""}]','游泳',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"play basketball" 的意思是？','[{"text": "打篮球", "correct": true, "icon": ""}, {"text": "踢足球", "correct": false, "icon": ""}, {"text": "打排球", "correct": false, "icon": ""}, {"text": "打乒乓球", "correct": false, "icon": ""}]','打篮球',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"play football" 的意思是？','[{"text": "踢足球", "correct": true, "icon": ""}, {"text": "打篮球", "correct": false, "icon": ""}, {"text": "打网球", "correct": false, "icon": ""}, {"text": "打羽毛球", "correct": false, "icon": ""}]','踢足球',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"circle" 的意思是？','[{"text": "圆形", "correct": true, "icon": ""}, {"text": "正方形", "correct": false, "icon": ""}, {"text": "三角形", "correct": false, "icon": ""}, {"text": "长方形", "correct": false, "icon": ""}]','圆形',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"square" 的意思是？','[{"text": "正方形", "correct": true, "icon": ""}, {"text": "圆形", "correct": false, "icon": ""}, {"text": "三角形", "correct": false, "icon": ""}, {"text": "长方形", "correct": false, "icon": ""}]','正方形',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"triangle" 的意思是？','[{"text": "三角形", "correct": true, "icon": ""}, {"text": "圆形", "correct": false, "icon": ""}, {"text": "正方形", "correct": false, "icon": ""}, {"text": "长方形", "correct": false, "icon": ""}]','三角形',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"rectangle" 的意思是？','[{"text": "长方形", "correct": true, "icon": ""}, {"text": "正方形", "correct": false, "icon": ""}, {"text": "三角形", "correct": false, "icon": ""}, {"text": "圆形", "correct": false, "icon": ""}]','长方形',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"desk" 的意思是？','[{"text": "课桌", "correct": true, "icon": ""}, {"text": "椅子", "correct": false, "icon": ""}, {"text": "黑板", "correct": false, "icon": ""}, {"text": "窗户", "correct": false, "icon": ""}]','课桌',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"blackboard" 的意思是？','[{"text": "黑板", "correct": true, "icon": ""}, {"text": "课桌", "correct": false, "icon": ""}, {"text": "粉笔", "correct": false, "icon": ""}, {"text": "门", "correct": false, "icon": ""}]','黑板',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"window" 的意思是？','[{"text": "窗户", "correct": true, "icon": ""}, {"text": "门", "correct": false, "icon": ""}, {"text": "黑板", "correct": false, "icon": ""}, {"text": "墙", "correct": false, "icon": ""}]','窗户',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"breakfast" 的意思是？','[{"text": "早餐", "correct": true, "icon": ""}, {"text": "午餐", "correct": false, "icon": ""}, {"text": "晚餐", "correct": false, "icon": ""}, {"text": "夜宵", "correct": false, "icon": ""}]','早餐',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"lunch" 的意思是？','[{"text": "午餐", "correct": true, "icon": ""}, {"text": "早餐", "correct": false, "icon": ""}, {"text": "晚餐", "correct": false, "icon": ""}, {"text": "点心", "correct": false, "icon": ""}]','午餐',1,1,1),
('english','PRIMARY_3','choice','food_sport','食物饮料与运动','"dinner" 的意思是？','[{"text": "晚餐", "correct": true, "icon": ""}, {"text": "午餐", "correct": false, "icon": ""}, {"text": "早餐", "correct": false, "icon": ""}, {"text": "下午茶", "correct": false, "icon": ""}]','晚餐',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_3 math（周长与时间计算）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','长方形的周长 = ？','[{"text": "（长+宽）× 2", "correct": false, "icon": ""}, {"text": "长 × 宽", "correct": false, "icon": ""}, {"text": "长 + 宽", "correct": false, "icon": ""}, {"text": "长 × 2 + 宽", "correct": false, "icon": ""}]','（长 + 宽）× 2',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','正方形的周长 = ？','[{"text": "边长 × 4", "correct": true, "icon": ""}, {"text": "边长 × 边长", "correct": false, "icon": ""}, {"text": "边长 + 4", "correct": false, "icon": ""}, {"text": "边长 × 2", "correct": false, "icon": ""}]','边长 × 4',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','长 6 宽 4 的长方形周长是？','[{"text": "20", "correct": true, "icon": ""}, {"text": "24", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "28", "correct": false, "icon": ""}]','20',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','边长 5 的正方形周长是？','[{"text": "20", "correct": true, "icon": ""}, {"text": "25", "correct": false, "icon": ""}, {"text": "15", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}]','20',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','1 小时 = ？ 分钟','[{"text": "60", "correct": true, "icon": ""}, {"text": "100", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}, {"text": "120", "correct": false, "icon": ""}]','60',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','1 分钟 = ？ 秒','[{"text": "60", "correct": true, "icon": ""}, {"text": "100", "correct": false, "icon": ""}, {"text": "30", "correct": false, "icon": ""}, {"text": "120", "correct": false, "icon": ""}]','60',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','2 小时 = ？ 分钟','[{"text": "120", "correct": true, "icon": ""}, {"text": "60", "correct": false, "icon": ""}, {"text": "200", "correct": false, "icon": ""}, {"text": "90", "correct": false, "icon": ""}]','120',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','3 分 = ？ 秒','[{"text": "180", "correct": true, "icon": ""}, {"text": "300", "correct": false, "icon": ""}, {"text": "90", "correct": false, "icon": ""}, {"text": "60", "correct": false, "icon": ""}]','180',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','345 + 267 = ？','[{"text": "612", "correct": true, "icon": ""}, {"text": "602", "correct": false, "icon": ""}, {"text": "512", "correct": false, "icon": ""}, {"text": "712", "correct": false, "icon": ""}]','612',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','700 - 245 = ？','[{"text": "455", "correct": true, "icon": ""}, {"text": "555", "correct": false, "icon": ""}, {"text": "445", "correct": false, "icon": ""}, {"text": "465", "correct": false, "icon": ""}]','455',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','1/3 和 1/2 哪个大？','[{"text": "1/2", "correct": true, "icon": ""}, {"text": "1/3", "correct": false, "icon": ""}, {"text": "一样大", "correct": false, "icon": ""}, {"text": "无法比较", "correct": false, "icon": ""}]','1/2',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','1/4 和 3/4 哪个大？','[{"text": "3/4", "correct": true, "icon": ""}, {"text": "1/4", "correct": false, "icon": ""}, {"text": "一样大", "correct": false, "icon": ""}, {"text": "无法比较", "correct": false, "icon": ""}]','3/4',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','8 时 15 分 = ？ 分钟','[{"text": "495", "correct": true, "icon": ""}, {"text": "815", "correct": false, "icon": ""}, {"text": "480", "correct": false, "icon": ""}, {"text": "525", "correct": false, "icon": ""}]','495',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','100 分钟 = ？ 小时 ？ 分钟','[{"text": "1小时40分", "correct": true, "icon": ""}, {"text": "1小时", "correct": false, "icon": ""}, {"text": "100分", "correct": false, "icon": ""}, {"text": "2小时", "correct": false, "icon": ""}]','1小时40分',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','长 8 宽 3 的长方形周长是？','[{"text": "22", "correct": true, "icon": ""}, {"text": "24", "correct": false, "icon": ""}, {"text": "11", "correct": false, "icon": ""}, {"text": "16", "correct": false, "icon": ""}]','22',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','边长 7 的正方形周长是？','[{"text": "28", "correct": true, "icon": ""}, {"text": "49", "correct": false, "icon": ""}, {"text": "21", "correct": false, "icon": ""}, {"text": "14", "correct": false, "icon": ""}]','28',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','456 + 289 = ？','[{"text": "745", "correct": true, "icon": ""}, {"text": "645", "correct": false, "icon": ""}, {"text": "855", "correct": false, "icon": ""}, {"text": "735", "correct": false, "icon": ""}]','745',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','900 - 367 = ？','[{"text": "533", "correct": true, "icon": ""}, {"text": "633", "correct": false, "icon": ""}, {"text": "433", "correct": false, "icon": ""}, {"text": "543", "correct": false, "icon": ""}]','533',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','上午 9 时到下午 3 时，经过了？','[{"text": "6小时", "correct": false, "icon": ""}, {"text": "4小时", "correct": false, "icon": ""}, {"text": "5小时", "correct": false, "icon": ""}, {"text": "8小时", "correct": false, "icon": ""}]','6 小时',1,1,1),
('math','PRIMARY_3','choice','perimeter_time','周长与时间计算','1 米 5 分米 = ？ 分米','[{"text": "15", "correct": true, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "105", "correct": false, "icon": ""}, {"text": "150", "correct": false, "icon": ""}]','15',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_3 yuwen（修改病句与古诗）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','修改病句："我们要学习雷锋精神事迹" →','[{"text": "我们要学习雷锋的精神", "correct": true, "icon": ""}, {"text": "我们要学习雷锋", "correct": false, "icon": ""}, {"text": "我们要雷锋精神", "correct": false, "icon": ""}, {"text": "我们要学雷锋的事迹", "correct": false, "icon": ""}]','我们要学习雷锋的精神',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','修改病句："我断定他大概生病了" →','[{"text": "我断定他生病了", "correct": true, "icon": ""}, {"text": "我大概他生病了", "correct": false, "icon": ""}, {"text": "我断定他大概病", "correct": false, "icon": ""}, {"text": "他断定我生病了", "correct": false, "icon": ""}]','我断定他生病了',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"赠刘景文" 的作者是？','[{"text": "苏轼", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "王安石", "correct": false, "icon": ""}]','苏轼',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"夜书所见" 的作者是？','[{"text": "叶绍翁", "correct": true, "icon": ""}, {"text": "苏轼", "correct": false, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}]','叶绍翁',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"萧萧梧叶送寒声" 的下一句是？','[{"text": "江上秋风动客情", "correct": true, "icon": ""}, {"text": "江上秋风送客情", "correct": false, "icon": ""}, {"text": "江上秋风动客心", "correct": false, "icon": ""}, {"text": "江上秋风吹客情", "correct": false, "icon": ""}]','江上秋风动客情',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"荷尽已无擎雨盖" 的下一句是？','[{"text": "菊残犹有傲霜枝", "correct": true, "icon": ""}, {"text": "菊残犹有傲霜枝", "correct": true, "icon": ""}, {"text": "菊残犹有傲寒枝", "correct": false, "icon": ""}, {"text": "菊残犹有傲雪枝", "correct": false, "icon": ""}]','菊残犹有傲霜枝',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','含"动物"的成语："对（ ）弹琴"','[{"text": "牛", "correct": true, "icon": ""}, {"text": "马", "correct": false, "icon": ""}, {"text": "羊", "correct": false, "icon": ""}, {"text": "狗", "correct": false, "icon": ""}]','牛',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','含"动物"的成语："守株待（ ）"','[{"text": "兔", "correct": true, "icon": ""}, {"text": "鸡", "correct": false, "icon": ""}, {"text": "狗", "correct": false, "icon": ""}, {"text": "羊", "correct": false, "icon": ""}]','兔',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','含"动物"的成语："画蛇添（ ）"','[{"text": "足", "correct": true, "icon": ""}, {"text": "脚", "correct": false, "icon": ""}, {"text": "爪", "correct": false, "icon": ""}, {"text": "腿", "correct": false, "icon": ""}]','足',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','含"动物"的成语："亡羊补（ ）"','[{"text": "牢", "correct": true, "icon": ""}, {"text": "圈", "correct": false, "icon": ""}, {"text": "栏", "correct": false, "icon": ""}, {"text": "门", "correct": false, "icon": ""}]','牢',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','修改病句："他穿着白色上衣和帽子" →','[{"text": "他穿着白色上衣，戴着帽子", "correct": true, "icon": ""}, {"text": "他穿着白色上衣和帽子", "correct": false, "icon": ""}, {"text": "他戴着白色上衣和帽子", "correct": false, "icon": ""}, {"text": "他穿白色上衣", "correct": false, "icon": ""}]','他穿着白色上衣，戴着帽子',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','修改病句："花园里开满了许多各种各样的花" →','[{"text": "花园里开满了各种各样的花", "correct": true, "icon": ""}, {"text": "花园里开满了许多花", "correct": false, "icon": ""}, {"text": "花园里许多各种各样的花", "correct": false, "icon": ""}, {"text": "花园里开满许多花", "correct": false, "icon": ""}]','花园里开满了各种各样的花',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"停车坐爱枫林晚" 的作者是？','[{"text": "杜牧", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}]','杜牧',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"霜叶红于二月花" 出自《》？','[{"text": "山行", "correct": true, "icon": ""}, {"text": "枫桥夜泊", "correct": false, "icon": ""}, {"text": "夜书所见", "correct": false, "icon": ""}, {"text": "赠刘景文", "correct": false, "icon": ""}]','山行',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"欲把西湖比西子" 的下一句是？','[{"text": "淡妆浓抹总相宜", "correct": true, "icon": ""}, {"text": "浓妆淡抹总相宜", "correct": false, "icon": ""}, {"text": "淡妆浓抹两相宜", "correct": false, "icon": ""}, {"text": "西湖淡抹总相宜", "correct": false, "icon": ""}]','淡妆浓抹总相宜',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','含"数字"的成语："（ ）言（ ）语"','[{"text": "三...两", "correct": true, "icon": ""}, {"text": "一...一", "correct": false, "icon": ""}, {"text": "七...八", "correct": false, "icon": ""}, {"text": "千...万", "correct": false, "icon": ""}]','三...两',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','修改病句："我估计他可能不会来了" →','[{"text": "我估计他不会来了", "correct": true, "icon": ""}, {"text": "我可能他不会来了", "correct": false, "icon": ""}, {"text": "我估计他可能不来", "correct": false, "icon": ""}, {"text": "他估计我可能不来", "correct": false, "icon": ""}]','我估计他不会来了',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"明月几时有" 的作者是？','[{"text": "苏轼", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "辛弃疾", "correct": false, "icon": ""}, {"text": "李清照", "correct": false, "icon": ""}]','苏轼',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"黄四娘家花满蹊" 的下一句是？','[{"text": "千朵万朵压枝低", "correct": true, "icon": ""}, {"text": "千朵万朵压枝低", "correct": true, "icon": ""}, {"text": "万紫千红总是春", "correct": false, "icon": ""}, {"text": "桃花潭水深千尺", "correct": false, "icon": ""}]','千朵万朵压枝低',1,1,1),
('yuwen','PRIMARY_3','choice','modify_gushi3','修改病句与古诗','"故人具鸡黍" 的下一句是？','[{"text": "邀我至田家", "correct": true, "icon": ""}, {"text": "邀我到田家", "correct": false, "icon": ""}, {"text": "邀我至田家", "correct": true, "icon": ""}, {"text": "带我到田家", "correct": false, "icon": ""}]','邀我至田家',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_4 english（一日三餐与问路）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"breakfast" 的汉语是？','[{"text": "早餐", "correct": true, "icon": ""}, {"text": "午餐", "correct": false, "icon": ""}, {"text": "晚餐", "correct": false, "icon": ""}, {"text": "夜宵", "correct": false, "icon": ""}]','早餐',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"lunch" 的汉语是？','[{"text": "午餐", "correct": true, "icon": ""}, {"text": "早餐", "correct": false, "icon": ""}, {"text": "晚餐", "correct": false, "icon": ""}, {"text": "点心", "correct": false, "icon": ""}]','午餐',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"dinner" 的汉语是？','[{"text": "晚餐", "correct": true, "icon": ""}, {"text": "午餐", "correct": false, "icon": ""}, {"text": "早餐", "correct": false, "icon": ""}, {"text": "下午茶", "correct": false, "icon": ""}]','晚餐',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"go straight" 的意思是？','[{"text": "直走", "correct": true, "icon": ""}, {"text": "左转", "correct": false, "icon": ""}, {"text": "右转", "correct": false, "icon": ""}, {"text": "停下", "correct": false, "icon": ""}]','直走',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"turn left" 的意思是？','[{"text": "向左转", "correct": true, "icon": ""}, {"text": "向右转", "correct": false, "icon": ""}, {"text": "直走", "correct": false, "icon": ""}, {"text": "往回走", "correct": false, "icon": ""}]','向左转',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"turn right" 的意思是？','[{"text": "向右转", "correct": true, "icon": ""}, {"text": "向左转", "correct": false, "icon": ""}, {"text": "直走", "correct": false, "icon": ""}, {"text": "绕道", "correct": false, "icon": ""}]','向右转',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"excuse me" 常用于？','[{"text": "打扰问路", "correct": true, "icon": ""}, {"text": "打招呼", "correct": false, "icon": ""}, {"text": "告别", "correct": false, "icon": ""}, {"text": "道歉", "correct": false, "icon": ""}]','打扰问路',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"played" 是哪个词的过去式？','[{"text": "play", "correct": true, "icon": ""}, {"text": "playing", "correct": false, "icon": ""}, {"text": "plays", "correct": false, "icon": ""}, {"text": "player", "correct": false, "icon": ""}]','play',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"visited" 的意思是？','[{"text": "参观/拜访（过去）", "correct": true, "icon": ""}, {"text": "参观（现在）", "correct": false, "icon": ""}, {"text": "将要参观", "correct": false, "icon": ""}, {"text": "正在参观", "correct": false, "icon": ""}]','参观/拜访（过去）',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"watched" 是哪个词的过去式？','[{"text": "watch", "correct": true, "icon": ""}, {"text": "watches", "correct": false, "icon": ""}, {"text": "watching", "correct": false, "icon": ""}, {"text": "watcher", "correct": false, "icon": ""}]','watch',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"eggplant" 的意思是？','[{"text": "茄子", "correct": true, "icon": ""}, {"text": "黄瓜", "correct": false, "icon": ""}, {"text": "西红柿", "correct": false, "icon": ""}, {"text": "土豆", "correct": false, "icon": ""}]','茄子',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"potato" 的意思是？','[{"text": "土豆", "correct": true, "icon": ""}, {"text": "西红柿", "correct": false, "icon": ""}, {"text": "黄瓜", "correct": false, "icon": ""}, {"text": "茄子", "correct": false, "icon": ""}]','土豆',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"tomato" 的意思是？','[{"text": "西红柿", "correct": true, "icon": ""}, {"text": "土豆", "correct": false, "icon": ""}, {"text": "茄子", "correct": false, "icon": ""}, {"text": "白菜", "correct": false, "icon": ""}]','西红柿',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"carrot" 的意思是？','[{"text": "胡萝卜", "correct": true, "icon": ""}, {"text": "西红柿", "correct": false, "icon": ""}, {"text": "土豆", "correct": false, "icon": ""}, {"text": "白菜", "correct": false, "icon": ""}]','胡萝卜',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"onion" 的意思是？','[{"text": "洋葱", "correct": true, "icon": ""}, {"text": "大蒜", "correct": false, "icon": ""}, {"text": "生姜", "correct": false, "icon": ""}, {"text": "辣椒", "correct": false, "icon": ""}]','洋葱',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"garden" 的意思是？','[{"text": "花园", "correct": true, "icon": ""}, {"text": "菜园", "correct": false, "icon": ""}, {"text": "果园", "correct": false, "icon": ""}, {"text": "公园", "correct": false, "icon": ""}]','花园',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"farm" 的意思是？','[{"text": "农场", "correct": true, "icon": ""}, {"text": "花园", "correct": false, "icon": ""}, {"text": "学校", "correct": false, "icon": ""}, {"text": "超市", "correct": false, "icon": ""}]','农场',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"behind" 的意思是？','[{"text": "在...后面", "correct": true, "icon": ""}, {"text": "在...前面", "correct": false, "icon": ""}, {"text": "在...上面", "correct": false, "icon": ""}, {"text": "在...下面", "correct": false, "icon": ""}]','在...后面',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"between" 的意思是？','[{"text": "在...之间", "correct": true, "icon": ""}, {"text": "在...上面", "correct": false, "icon": ""}, {"text": "在...后面", "correct": false, "icon": ""}, {"text": "在...旁边", "correct": false, "icon": ""}]','在...之间',1,1,1),
('english','PRIMARY_4','choice','meals_direction','一日三餐与问路','"library" 和哪个词同类？','[{"text": "hospital", "correct": true, "icon": ""}, {"text": "apple", "correct": false, "icon": ""}, {"text": "happy", "correct": false, "icon": ""}, {"text": "teacher", "correct": false, "icon": ""}]','hospital',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_4 math（四则运算与三角形）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','3 + 4 × 2 = ？','[{"text": "11", "correct": true, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "15", "correct": false, "icon": ""}]','11',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','12 - 6 ÷ 2 = ？','[{"text": "9", "correct": true, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "15", "correct": false, "icon": ""}]','9',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','(3 + 5) × 2 = ？','[{"text": "16", "correct": true, "icon": ""}, {"text": "13", "correct": false, "icon": ""}, {"text": "11", "correct": false, "icon": ""}, {"text": "18", "correct": false, "icon": ""}]','16',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','25 × 4 = ？','[{"text": "100", "correct": true, "icon": ""}, {"text": "90", "correct": false, "icon": ""}, {"text": "110", "correct": false, "icon": ""}, {"text": "120", "correct": false, "icon": ""}]','100',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','125 × 8 = ？','[{"text": "1000", "correct": true, "icon": ""}, {"text": "900", "correct": false, "icon": ""}, {"text": "1100", "correct": false, "icon": ""}, {"text": "2000", "correct": false, "icon": ""}]','1000',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','加法交换律：a + b = ？','[{"text": "b + a", "correct": true, "icon": ""}, {"text": "a - b", "correct": false, "icon": ""}, {"text": "a × b", "correct": false, "icon": ""}, {"text": "a ÷ b", "correct": false, "icon": ""}]','b + a',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','乘法结合律：(a × b) × c = ？','[{"text": "a × (b × c)", "correct": true, "icon": ""}, {"text": "a + (b × c)", "correct": false, "icon": ""}, {"text": "(a + b) × c", "correct": false, "icon": ""}, {"text": "a × b + c", "correct": false, "icon": ""}]','a × (b × c)',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','乘法分配律：a × (b + c) = ？','[{"text": "a × b + a × c", "correct": true, "icon": ""}, {"text": "a × b × c", "correct": false, "icon": ""}, {"text": "a + b + c", "correct": false, "icon": ""}, {"text": "a × b + c", "correct": false, "icon": ""}]','a × b + a × c',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','等边三角形三个角都是？','[{"text": "60度", "correct": false, "icon": ""}, {"text": "90度", "correct": false, "icon": ""}, {"text": "45度", "correct": false, "icon": ""}, {"text": "30度", "correct": false, "icon": ""}]','60 度',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','等腰三角形两底角？','[{"text": "相等", "correct": true, "icon": ""}, {"text": "不等", "correct": false, "icon": ""}, {"text": "互补", "correct": false, "icon": ""}, {"text": "互余", "correct": false, "icon": ""}]','相等',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','有一个角是钝角的三角形叫？','[{"text": "钝角三角形", "correct": true, "icon": ""}, {"text": "锐角三角形", "correct": false, "icon": ""}, {"text": "直角三角形", "correct": false, "icon": ""}, {"text": "等腰三角形", "correct": false, "icon": ""}]','钝角三角形',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','有一个角是直角的三角形叫？','[{"text": "直角三角形", "correct": true, "icon": ""}, {"text": "钝角三角形", "correct": false, "icon": ""}, {"text": "锐角三角形", "correct": false, "icon": ""}, {"text": "等边三角形", "correct": false, "icon": ""}]','直角三角形',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','平均数：(86 + 90 + 94) ÷ 3 = ？','[{"text": "90", "correct": true, "icon": ""}, {"text": "88", "correct": false, "icon": ""}, {"text": "92", "correct": false, "icon": ""}, {"text": "89", "correct": false, "icon": ""}]','90',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','一组数据 5、7、9 的平均数是？','[{"text": "7", "correct": true, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}]','7',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','0 不能作（ ）','[{"text": "除数", "correct": true, "icon": ""}, {"text": "被除数", "correct": false, "icon": ""}, {"text": "因数", "correct": false, "icon": ""}, {"text": "加数", "correct": false, "icon": ""}]','除数',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','48 ÷ 6 + 12 = ？','[{"text": "20", "correct": true, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "14", "correct": false, "icon": ""}, {"text": "16", "correct": false, "icon": ""}]','20',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','36 ÷ (12 - 6) = ？','[{"text": "6", "correct": true, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','三角形任意两边之和（ ）第三边','[{"text": "大于", "correct": true, "icon": ""}, {"text": "小于", "correct": false, "icon": ""}, {"text": "等于", "correct": false, "icon": ""}, {"text": "不大于", "correct": false, "icon": ""}]','大于',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','等腰三角形顶角 80°，底角是？','[{"text": "50度", "correct": false, "icon": ""}, {"text": "40度", "correct": false, "icon": ""}, {"text": "100度", "correct": false, "icon": ""}, {"text": "80度", "correct": false, "icon": ""}]','50 度',1,1,1),
('math','PRIMARY_4','choice','four_ops_triangle','四则运算与三角形','平均数能反映一组数据的（ ）','[{"text": "总体水平", "correct": true, "icon": ""}, {"text": "最大值", "correct": false, "icon": ""}, {"text": "最小值", "correct": false, "icon": ""}, {"text": "波动幅度", "correct": false, "icon": ""}]','总体水平',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_4 yuwen（口语交际与古诗）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','打电话时先说什么？','[{"text": "您好，我是...", "correct": true, "icon": ""}, {"text": "喂，谁啊", "correct": false, "icon": ""}, {"text": "你找谁", "correct": false, "icon": ""}, {"text": "没事我挂了", "correct": false, "icon": ""}]','您好，我是...',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','向别人借东西应该？','[{"text": "礼貌征询", "correct": true, "icon": ""}, {"text": "直接拿走", "correct": false, "icon": ""}, {"text": "大声命令", "correct": false, "icon": ""}, {"text": "不问自取", "correct": false, "icon": ""}]','礼貌征询',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"题西林壁" 的作者是？','[{"text": "苏轼", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "王安石", "correct": false, "icon": ""}, {"text": "黄庭坚", "correct": false, "icon": ""}]','苏轼',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"横看成岭侧成峰" 出自《》？','[{"text": "题西林壁", "correct": true, "icon": ""}, {"text": "望庐山瀑布", "correct": false, "icon": ""}, {"text": "游山西村", "correct": false, "icon": ""}, {"text": "饮湖上初晴后雨", "correct": false, "icon": ""}]','题西林壁',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"不识庐山真面目" 的下一句是？','[{"text": "只缘身在此山中", "correct": true, "icon": ""}, {"text": "只缘身在此山中", "correct": true, "icon": ""}, {"text": "不知庐山真面目", "correct": false, "icon": ""}, {"text": "只在此山中", "correct": false, "icon": ""}]','只缘身在此山中',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"游山西村" 的作者是？','[{"text": "陆游", "correct": true, "icon": ""}, {"text": "苏轼", "correct": false, "icon": ""}, {"text": "辛弃疾", "correct": false, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}]','陆游',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"山重水复疑无路" 的下一句是？','[{"text": "柳暗花明又一村", "correct": true, "icon": ""}, {"text": "柳暗花明又一村", "correct": true, "icon": ""}, {"text": "山重水复又一村", "correct": false, "icon": ""}, {"text": "柳暗花明又一山", "correct": false, "icon": ""}]','柳暗花明又一村',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"出塞" 的作者是？','[{"text": "王昌龄", "correct": true, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}]','王昌龄',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"秦时明月汉时关" 的下一句是？','[{"text": "万里长征人未还", "correct": true, "icon": ""}, {"text": "万里长征人未还", "correct": true, "icon": ""}, {"text": "千里长征人未还", "correct": false, "icon": ""}, {"text": "万里长征还未还", "correct": false, "icon": ""}]','万里长征人未还',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"凉州词" 的作者是？','[{"text": "王翰", "correct": true, "icon": ""}, {"text": "王昌龄", "correct": false, "icon": ""}, {"text": "王之涣", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}]','王翰',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"醉卧沙场君莫笑" 的下一句是？','[{"text": "古来征战几人回", "correct": true, "icon": ""}, {"text": "古来征战几人还", "correct": false, "icon": ""}, {"text": "古来征战几时回", "correct": false, "icon": ""}, {"text": "万里长征几人回", "correct": false, "icon": ""}]','古来征战几人回',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"回乡偶书" 的作者是？','[{"text": "贺知章", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "孟浩然", "correct": false, "icon": ""}]','贺知章',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"少小离家老大回" 中的"老大"指？','[{"text": "年纪大了", "correct": true, "icon": ""}, {"text": "排行老大", "correct": false, "icon": ""}, {"text": "老大哥", "correct": false, "icon": ""}, {"text": "老人", "correct": false, "icon": ""}]','年纪大了',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"送元二使安西" 的作者是？','[{"text": "王维", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "白居易", "correct": false, "icon": ""}]','王维',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"劝君更尽一杯酒" 的下一句是？','[{"text": "西出阳关无故人", "correct": true, "icon": ""}, {"text": "西出阳关无故人", "correct": true, "icon": ""}, {"text": "西出阳关无朋友", "correct": false, "icon": ""}, {"text": "西出阳关无故友", "correct": false, "icon": ""}]','西出阳关无故人',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','历史典故成语："卧薪尝胆" 的主人公是？','[{"text": "勾践", "correct": true, "icon": ""}, {"text": "项羽", "correct": false, "icon": ""}, {"text": "刘备", "correct": false, "icon": ""}, {"text": "韩信", "correct": false, "icon": ""}]','勾践',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','历史典故成语："三顾茅庐" 说的是谁？','[{"text": "刘备请诸葛亮", "correct": true, "icon": ""}, {"text": "曹操请关羽", "correct": false, "icon": ""}, {"text": "孙权请周瑜", "correct": false, "icon": ""}, {"text": "项羽请范增", "correct": false, "icon": ""}]','刘备请诸葛亮',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"纸上谈兵" 的主人公是？','[{"text": "赵括", "correct": true, "icon": ""}, {"text": "赵奢", "correct": false, "icon": ""}, {"text": "廉颇", "correct": false, "icon": ""}, {"text": "白起", "correct": false, "icon": ""}]','赵括',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"负荆请罪" 说的是谁？','[{"text": "廉颇向蔺相如请罪", "correct": true, "icon": ""}, {"text": "蔺相如向廉颇请罪", "correct": false, "icon": ""}, {"text": "廉颇向赵王请罪", "correct": false, "icon": ""}, {"text": "蔺相如向赵王请罪", "correct": false, "icon": ""}]','廉颇向蔺相如请罪',1,1,1),
('yuwen','PRIMARY_4','choice','kouyu_read4','口语交际与古诗','"完璧归赵" 的主人公是？','[{"text": "蔺相如", "correct": true, "icon": ""}, {"text": "廉颇", "correct": false, "icon": ""}, {"text": "赵括", "correct": false, "icon": ""}, {"text": "白起", "correct": false, "icon": ""}]','蔺相如',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_5 english（交通方式与节日）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"subway" 的意思是？','[{"text": "地铁", "correct": true, "icon": ""}, {"text": "公交", "correct": false, "icon": ""}, {"text": "火车", "correct": false, "icon": ""}, {"text": "飞机", "correct": false, "icon": ""}]','地铁',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"taxi" 的意思是？','[{"text": "出租车", "correct": true, "icon": ""}, {"text": "公交车", "correct": false, "icon": ""}, {"text": "地铁", "correct": false, "icon": ""}, {"text": "自行车", "correct": false, "icon": ""}]','出租车',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"on foot" 的意思是？','[{"text": "步行", "correct": true, "icon": ""}, {"text": "骑车", "correct": false, "icon": ""}, {"text": "坐车", "correct": false, "icon": ""}, {"text": "跑步", "correct": false, "icon": ""}]','步行',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"by car" 的意思是？','[{"text": "坐小汽车", "correct": true, "icon": ""}, {"text": "坐公交", "correct": false, "icon": ""}, {"text": "坐火车", "correct": false, "icon": ""}, {"text": "走路", "correct": false, "icon": ""}]','坐小汽车',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"Spring Festival" 的意思是？','[{"text": "春节", "correct": true, "icon": ""}, {"text": "中秋节", "correct": false, "icon": ""}, {"text": "端午节", "correct": false, "icon": ""}, {"text": "国庆节", "correct": false, "icon": ""}]','春节',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"Christmas" 的意思是？','[{"text": "圣诞节", "correct": true, "icon": ""}, {"text": "春节", "correct": false, "icon": ""}, {"text": "元旦", "correct": false, "icon": ""}, {"text": "万圣节", "correct": false, "icon": ""}]','圣诞节',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"Mid-Autumn Festival" 的意思是？','[{"text": "中秋节", "correct": true, "icon": ""}, {"text": "春节", "correct": false, "icon": ""}, {"text": "端午节", "correct": false, "icon": ""}, {"text": "重阳节", "correct": false, "icon": ""}]','中秋节',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','一般将来时：I ___ go to Beijing tomorrow.','[{"text": "will", "correct": true, "icon": ""}, {"text": "went", "correct": false, "icon": ""}, {"text": "goes", "correct": false, "icon": ""}, {"text": "am", "correct": false, "icon": ""}]','will',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"be going to" 表示？','[{"text": "打算/将要", "correct": true, "icon": ""}, {"text": "已经", "correct": false, "icon": ""}, {"text": "正在", "correct": false, "icon": ""}, {"text": "经常", "correct": false, "icon": ""}]','打算/将要',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"fever" 的意思是？','[{"text": "发烧", "correct": true, "icon": ""}, {"text": "咳嗽", "correct": false, "icon": ""}, {"text": "头痛", "correct": false, "icon": ""}, {"text": "感冒", "correct": false, "icon": ""}]','发烧',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"cough" 的意思是？','[{"text": "咳嗽", "correct": true, "icon": ""}, {"text": "发烧", "correct": false, "icon": ""}, {"text": "头痛", "correct": false, "icon": ""}, {"text": "流鼻涕", "correct": false, "icon": ""}]','咳嗽',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"headache" 的意思是？','[{"text": "头痛", "correct": true, "icon": ""}, {"text": "牙痛", "correct": false, "icon": ""}, {"text": "胃痛", "correct": false, "icon": ""}, {"text": "发烧", "correct": false, "icon": ""}]','头痛',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"see a doctor" 的意思是？','[{"text": "看医生", "correct": true, "icon": ""}, {"text": "买药", "correct": false, "icon": ""}, {"text": "住院", "correct": false, "icon": ""}, {"text": "打针", "correct": false, "icon": ""}]','看医生',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"take medicine" 的意思是？','[{"text": "吃药", "correct": true, "icon": ""}, {"text": "打针", "correct": false, "icon": ""}, {"text": "看医生", "correct": false, "icon": ""}, {"text": "休息", "correct": false, "icon": ""}]','吃药',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"have a cold" 的意思是？','[{"text": "感冒", "correct": true, "icon": ""}, {"text": "发烧", "correct": false, "icon": ""}, {"text": "咳嗽", "correct": false, "icon": ""}, {"text": "头痛", "correct": false, "icon": ""}]','感冒',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"usually" 的意思是？','[{"text": "通常", "correct": true, "icon": ""}, {"text": "有时", "correct": false, "icon": ""}, {"text": "从不", "correct": false, "icon": ""}, {"text": "总是", "correct": false, "icon": ""}]','通常',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"sometimes" 的意思是？','[{"text": "有时", "correct": true, "icon": ""}, {"text": "通常", "correct": false, "icon": ""}, {"text": "总是", "correct": false, "icon": ""}, {"text": "从不", "correct": false, "icon": ""}]','有时',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"never" 的意思是？','[{"text": "从不", "correct": true, "icon": ""}, {"text": "有时", "correct": false, "icon": ""}, {"text": "总是", "correct": false, "icon": ""}, {"text": "经常", "correct": false, "icon": ""}]','从不',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"healthy" 的意思是？','[{"text": "健康的", "correct": true, "icon": ""}, {"text": "生病的", "correct": false, "icon": ""}, {"text": "强壮的", "correct": false, "icon": ""}, {"text": "虚弱的", "correct": false, "icon": ""}]','健康的',1,1,1),
('english','PRIMARY_5','choice','traffic_festival','交通方式与节日','"exercise" 的意思是？','[{"text": "锻炼", "correct": true, "icon": ""}, {"text": "吃饭", "correct": false, "icon": ""}, {"text": "睡觉", "correct": false, "icon": ""}, {"text": "学习", "correct": false, "icon": ""}]','锻炼',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_5 math（长方体与因数倍数）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','长方体有（ ）个面','[{"text": "6", "correct": true, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','长方体有（ ）条棱','[{"text": "12", "correct": true, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "10", "correct": false, "icon": ""}]','12',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','长方体有（ ）个顶点','[{"text": "8", "correct": true, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}]','8',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','正方体是特殊的长方体吗？','[{"text": "是", "correct": true, "icon": ""}, {"text": "不是", "correct": false, "icon": ""}, {"text": "不确定", "correct": false, "icon": ""}, {"text": "有时是", "correct": false, "icon": ""}]','是',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','长方体的体积 = ？','[{"text": "长 × 宽 × 高", "correct": true, "icon": ""}, {"text": "长 × 宽", "correct": false, "icon": ""}, {"text": "底 × 高", "correct": false, "icon": ""}, {"text": "棱长 × 6", "correct": false, "icon": ""}]','长 × 宽 × 高',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','棱长 3 的正方体体积是？','[{"text": "27", "correct": true, "icon": ""}, {"text": "9", "correct": false, "icon": ""}, {"text": "18", "correct": false, "icon": ""}, {"text": "36", "correct": false, "icon": ""}]','27',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','长 4 宽 3 高 2 的长方体体积是？','[{"text": "24", "correct": true, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "48", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}]','24',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','最小的质数是？','[{"text": "2", "correct": true, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}]','2',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','最小的合数是？','[{"text": "4", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}, {"text": "1", "correct": false, "icon": ""}]','4',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','12 的因数有（ ）个','[{"text": "6", "correct": true, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "7", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','12 和 18 的最大公因数是？','[{"text": "6", "correct": true, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','12 和 18 的最小公倍数是？','[{"text": "36", "correct": true, "icon": ""}, {"text": "18", "correct": false, "icon": ""}, {"text": "54", "correct": false, "icon": ""}, {"text": "24", "correct": false, "icon": ""}]','36',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','条形统计图适合表示？','[{"text": "数量的多少", "correct": true, "icon": ""}, {"text": "变化趋势", "correct": false, "icon": ""}, {"text": "分布情况", "correct": false, "icon": ""}, {"text": "所占比例", "correct": false, "icon": ""}]','数量的多少',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','折线统计图适合表示？','[{"text": "增减变化趋势", "correct": true, "icon": ""}, {"text": "数量的多少", "correct": false, "icon": ""}, {"text": "分布情况", "correct": false, "icon": ""}, {"text": "所占比例", "correct": false, "icon": ""}]','增减变化趋势',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','解方程：2x + 5 = 15，x = ？','[{"text": "5", "correct": true, "icon": ""}, {"text": "10", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}]','5',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','解方程：3x - 6 = 12，x = ？','[{"text": "6", "correct": true, "icon": ""}, {"text": "4", "correct": false, "icon": ""}, {"text": "8", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}]','6',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','解方程：x ÷ 4 = 8，x = ？','[{"text": "32", "correct": true, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "4", "correct": false, "icon": ""}]','32',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','36 的因数中，最大的是？','[{"text": "36", "correct": true, "icon": ""}, {"text": "18", "correct": false, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "6", "correct": false, "icon": ""}]','36',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','30 和 45 的最大公因数是？','[{"text": "15", "correct": true, "icon": ""}, {"text": "5", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "9", "correct": false, "icon": ""}]','15',1,1,1),
('math','PRIMARY_5','choice','cuboid_factor','长方体与因数倍数','棱长总和：长 5 宽 4 高 3 的长方体棱长总和是？','[{"text": "48", "correct": true, "icon": ""}, {"text": "12", "correct": false, "icon": ""}, {"text": "60", "correct": false, "icon": ""}, {"text": "24", "correct": false, "icon": ""}]','48',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_5 yuwen（歇后语与说明文）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"竹篮打水——一场空" 的歇后语用了什么手法？','[{"text": "双关/比喻", "correct": true, "icon": ""}, {"text": "夸张", "correct": false, "icon": ""}, {"text": "拟人", "correct": false, "icon": ""}, {"text": "排比", "correct": false, "icon": ""}]','双关/比喻',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"打破砂锅——问到底" 的"底"指？','[{"text": "事情的真相", "correct": true, "icon": ""}, {"text": "锅底", "correct": false, "icon": ""}, {"text": "底部", "correct": false, "icon": ""}, {"text": "根本", "correct": false, "icon": ""}]','事情的真相',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"王婆卖瓜——自卖自夸" 形容？','[{"text": "自我吹嘘", "correct": true, "icon": ""}, {"text": "诚实", "correct": false, "icon": ""}, {"text": "谦虚", "correct": false, "icon": ""}, {"text": "自信", "correct": false, "icon": ""}]','自我吹嘘',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','说明文"列数字"的好处是？','[{"text": "准确具体", "correct": true, "icon": ""}, {"text": "生动形象", "correct": false, "icon": ""}, {"text": "直观清晰", "correct": false, "icon": ""}, {"text": "简单明了", "correct": false, "icon": ""}]','准确具体',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','说明文"作比较"的好处是？','[{"text": "突出特点", "correct": true, "icon": ""}, {"text": "准确具体", "correct": false, "icon": ""}, {"text": "生动形象", "correct": false, "icon": ""}, {"text": "通俗易懂", "correct": false, "icon": ""}]','突出特点',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"山居秋暝" 的作者是？','[{"text": "王维", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}, {"text": "孟浩然", "correct": false, "icon": ""}]','王维',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"空山新雨后" 的下一句是？','[{"text": "天气晚来秋", "correct": true, "icon": ""}, {"text": "天气晚来秋", "correct": true, "icon": ""}, {"text": "山中一夜雨", "correct": false, "icon": ""}, {"text": "秋日胜春朝", "correct": false, "icon": ""}]','天气晚来秋',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"枫桥夜泊" 的作者是？','[{"text": "张继", "correct": true, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "杜甫", "correct": false, "icon": ""}]','张继',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"月落乌啼霜满天" 的下一句是？','[{"text": "江枫渔火对愁眠", "correct": true, "icon": ""}, {"text": "江枫渔火对愁眠", "correct": true, "icon": ""}, {"text": "姑苏城外寒山寺", "correct": false, "icon": ""}, {"text": "夜半钟声到客船", "correct": false, "icon": ""}]','江枫渔火对愁眠',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"姑苏城外寒山寺" 的下一句是？','[{"text": "夜半钟声到客船", "correct": true, "icon": ""}, {"text": "江枫渔火对愁眠", "correct": false, "icon": ""}, {"text": "月落乌啼霜满天", "correct": false, "icon": ""}, {"text": "姑苏城外寒山寺", "correct": false, "icon": ""}]','夜半钟声到客船',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','褒义成语："大公无私" 形容？','[{"text": "公正无私", "correct": true, "icon": ""}, {"text": "自私自利", "correct": false, "icon": ""}, {"text": "胆小怕事", "correct": false, "icon": ""}, {"text": "马马虎虎", "correct": false, "icon": ""}]','公正无私',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','贬义成语："骄傲自满" 形容？','[{"text": "自以为了不起", "correct": true, "icon": ""}, {"text": "谦虚谨慎", "correct": false, "icon": ""}, {"text": "勤奋努力", "correct": false, "icon": ""}, {"text": "认真负责", "correct": false, "icon": ""}]','自以为了不起',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"夸父逐日" 表达了？','[{"text": "坚持不懈的精神", "correct": true, "icon": ""}, {"text": "太阳很大", "correct": false, "icon": ""}, {"text": "跑得很快", "correct": false, "icon": ""}, {"text": "十分害怕", "correct": false, "icon": ""}]','坚持不懈的精神',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"嫦娥奔月" 和哪个节日有关？','[{"text": "中秋节", "correct": true, "icon": ""}, {"text": "春节", "correct": false, "icon": ""}, {"text": "端午节", "correct": false, "icon": ""}, {"text": "元宵节", "correct": false, "icon": ""}]','中秋节',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','说明顺序有？','[{"text": "时间/空间/逻辑", "correct": true, "icon": ""}, {"text": "上下/左右/前后", "correct": false, "icon": ""}, {"text": "大小/多少/快慢", "correct": false, "icon": ""}, {"text": "只有时间", "correct": false, "icon": ""}]','时间/空间/逻辑',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"大禹治水" 体现的品质是？','[{"text": "无私奉献/智慧", "correct": true, "icon": ""}, {"text": "力气很大", "correct": false, "icon": ""}, {"text": "不怕水", "correct": false, "icon": ""}, {"text": "很有钱", "correct": false, "icon": ""}]','无私奉献/智慧',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"望梅止渴" 的主人公是？','[{"text": "曹操", "correct": true, "icon": ""}, {"text": "刘备", "correct": false, "icon": ""}, {"text": "孙权", "correct": false, "icon": ""}, {"text": "诸葛亮", "correct": false, "icon": ""}]','曹操',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"精卫填海" 体现了？','[{"text": "坚持不懈", "correct": true, "icon": ""}, {"text": "力气大", "correct": false, "icon": ""}, {"text": "很聪明", "correct": false, "icon": ""}, {"text": "很勇敢", "correct": false, "icon": ""}]','坚持不懈',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','说明文语言要求？','[{"text": "准确严密", "correct": true, "icon": ""}, {"text": "生动夸张", "correct": false, "icon": ""}, {"text": "随意口语", "correct": false, "icon": ""}, {"text": "华丽花哨", "correct": false, "icon": ""}]','准确严密',1,1,1),
('yuwen','PRIMARY_5','choice','xiehouyu_shuoming','歇后语与说明文','"八仙过海——各显神通" 形容？','[{"text": "各显本领", "correct": true, "icon": ""}, {"text": "各走各路", "correct": false, "icon": ""}, {"text": "七嘴八舌", "correct": false, "icon": ""}, {"text": "千军万马", "correct": false, "icon": ""}]','各显本领',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_6 english（情态动词与时态综合）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"can" 表示？','[{"text": "能/会", "correct": true, "icon": ""}, {"text": "必须", "correct": false, "icon": ""}, {"text": "应该", "correct": false, "icon": ""}, {"text": "将要", "correct": false, "icon": ""}]','能/会',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"must" 表示？','[{"text": "必须", "correct": true, "icon": ""}, {"text": "可以", "correct": false, "icon": ""}, {"text": "能够", "correct": false, "icon": ""}, {"text": "应该", "correct": false, "icon": ""}]','必须',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"should" 表示？','[{"text": "应该", "correct": true, "icon": ""}, {"text": "必须", "correct": false, "icon": ""}, {"text": "能够", "correct": false, "icon": ""}, {"text": "将要", "correct": false, "icon": ""}]','应该',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','She ___ (go) to school every day.','[{"text": "goes", "correct": true, "icon": ""}, {"text": "go", "correct": false, "icon": ""}, {"text": "going", "correct": false, "icon": ""}, {"text": "went", "correct": false, "icon": ""}]','goes',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','He ___ (have) a book.','[{"text": "has", "correct": true, "icon": ""}, {"text": "have", "correct": false, "icon": ""}, {"text": "had", "correct": false, "icon": ""}, {"text": "having", "correct": false, "icon": ""}]','has',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','Does he ___ to school?','[{"text": "go", "correct": true, "icon": ""}, {"text": "goes", "correct": false, "icon": ""}, {"text": "going", "correct": false, "icon": ""}, {"text": "went", "correct": false, "icon": ""}]','go',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"Don''t run!" 是什么句型？','[{"text": "祈使句", "correct": true, "icon": ""}, {"text": "感叹句", "correct": false, "icon": ""}, {"text": "疑问句", "correct": false, "icon": ""}, {"text": "陈述句", "correct": false, "icon": ""}]','祈使句',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"Please sit down." 是？','[{"text": "祈使句", "correct": true, "icon": ""}, {"text": "疑问句", "correct": false, "icon": ""}, {"text": "感叹句", "correct": false, "icon": ""}, {"text": "陈述句", "correct": false, "icon": ""}]','祈使句',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','比较级标志词是？','[{"text": "than", "correct": true, "icon": ""}, {"text": "the", "correct": false, "icon": ""}, {"text": "more", "correct": false, "icon": ""}, {"text": "most", "correct": false, "icon": ""}]','than',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','最高级标志是？','[{"text": "the + 最高级", "correct": true, "icon": ""}, {"text": "比较级 + than", "correct": false, "icon": ""}, {"text": "more + 原级", "correct": false, "icon": ""}, {"text": "原级 + er", "correct": false, "icon": ""}]','the + 最高级',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"big" 的比较级是？','[{"text": "bigger", "correct": true, "icon": ""}, {"text": "bigest", "correct": false, "icon": ""}, {"text": "more big", "correct": false, "icon": ""}, {"text": "big", "correct": false, "icon": ""}]','bigger',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"beautiful" 的最高级是？','[{"text": "most beautiful", "correct": true, "icon": ""}, {"text": "beautifulest", "correct": false, "icon": ""}, {"text": "more beautiful", "correct": false, "icon": ""}, {"text": "beautifullest", "correct": false, "icon": ""}]','most beautiful',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"did" 后接动词的？','[{"text": "原形", "correct": true, "icon": ""}, {"text": "过去式", "correct": false, "icon": ""}, {"text": "现在分词", "correct": false, "icon": ""}, {"text": "过去分词", "correct": false, "icon": ""}]','原形',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"have/has + 过去分词" 是？','[{"text": "现在完成时", "correct": true, "icon": ""}, {"text": "一般过去时", "correct": false, "icon": ""}, {"text": "现在进行时", "correct": false, "icon": ""}, {"text": "一般将来时", "correct": false, "icon": ""}]','现在完成时',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"am/is/are going to" 是？','[{"text": "一般将来时", "correct": true, "icon": ""}, {"text": "现在进行时", "correct": false, "icon": ""}, {"text": "一般过去时", "correct": false, "icon": ""}, {"text": "现在完成时", "correct": false, "icon": ""}]','一般将来时',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','反义疑问句："She is a teacher, ___?"','[{"text": "isn''t she", "correct": true, "icon": ""}, {"text": "is she", "correct": false, "icon": ""}, {"text": "doesn''t she", "correct": false, "icon": ""}, {"text": "was she", "correct": false, "icon": ""}]','isn''t she',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"too" 和 "either" 的区别？','[{"text": "too 肯定句，either 否定句", "correct": true, "icon": ""}, {"text": "两者相同", "correct": false, "icon": ""}, {"text": "too 否定句，either 肯定句", "correct": false, "icon": ""}, {"text": "都用于疑问句", "correct": false, "icon": ""}]','too 肯定句，either 否定句',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"so" 和 "such" 的区别？','[{"text": "so 修饰形容词/副词，such 修饰名词", "correct": true, "icon": ""}, {"text": "两者相同", "correct": false, "icon": ""}, {"text": "so 修饰名词，such 修饰形容词", "correct": false, "icon": ""}, {"text": "都修饰名词", "correct": false, "icon": ""}]','so 修饰形容词/副词，such 修饰名词',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"used to" 表示？','[{"text": "过去常常", "correct": true, "icon": ""}, {"text": "现在经常", "correct": false, "icon": ""}, {"text": "将要", "correct": false, "icon": ""}, {"text": "正在", "correct": false, "icon": ""}]','过去常常',1,1,1),
('english','PRIMARY_6','choice','modal_tense','情态动词与时态综合','"get up" 的过去式是？','[{"text": "got up", "correct": true, "icon": ""}, {"text": "get up", "correct": false, "icon": ""}, {"text": "gets up", "correct": false, "icon": ""}, {"text": "getting up", "correct": false, "icon": ""}]','got up',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_6 math（负数与比例尺）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','零下 5 度记作？','[{"text": "-5℃", "correct": true, "icon": ""}, {"text": "5℃", "correct": false, "icon": ""}, {"text": "0℃", "correct": false, "icon": ""}, {"text": "-5", "correct": false, "icon": ""}]','-5℃',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','负数都比（ ）小？','[{"text": "0", "correct": true, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "-1", "correct": false, "icon": ""}, {"text": "正数", "correct": false, "icon": ""}]','0',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','-3 和 -5 哪个大？','[{"text": "-3", "correct": true, "icon": ""}, {"text": "-5", "correct": false, "icon": ""}, {"text": "一样大", "correct": false, "icon": ""}, {"text": "无法比较", "correct": false, "icon": ""}]','-3',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','比例尺 = ？','[{"text": "图上距离 ÷ 实际距离", "correct": true, "icon": ""}, {"text": "实际距离 ÷ 图上距离", "correct": false, "icon": ""}, {"text": "图上距离 × 实际距离", "correct": false, "icon": ""}, {"text": "图上距离 + 实际距离", "correct": false, "icon": ""}]','图上距离 ÷ 实际距离',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','比例尺 1:100 表示？','[{"text": "图上1厘米=实际100厘米", "correct": true, "icon": ""}, {"text": "图上1厘米=实际1厘米", "correct": false, "icon": ""}, {"text": "图上100厘米=实际1厘米", "correct": false, "icon": ""}, {"text": "图上1米=实际100米", "correct": false, "icon": ""}]','图上1厘米=实际100厘米',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','圆柱的体积 = ？','[{"text": "底面积 × 高", "correct": true, "icon": ""}, {"text": "底面积 + 高", "correct": false, "icon": ""}, {"text": "侧面积 × 高", "correct": false, "icon": ""}, {"text": "底面周长 × 高", "correct": false, "icon": ""}]','底面积 × 高',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','圆柱的侧面积 = ？','[{"text": "底面周长 × 高", "correct": true, "icon": ""}, {"text": "底面积 × 高", "correct": false, "icon": ""}, {"text": "底面积 × 2", "correct": false, "icon": ""}, {"text": "底面周长 × 2", "correct": false, "icon": ""}]','底面周长 × 高',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','圆锥的体积 = ？','[{"text": "1/3 × 底面积 × 高", "correct": true, "icon": ""}, {"text": "底面积 × 高", "correct": false, "icon": ""}, {"text": "底面积 + 高", "correct": false, "icon": ""}, {"text": "2/3 × 底面积 × 高", "correct": false, "icon": ""}]','1/3 × 底面积 × 高',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','可能性："掷硬币正面朝上" 的可能性是？','[{"text": "1/2", "correct": true, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}, {"text": "1/3", "correct": false, "icon": ""}]','1/2',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','可能性："太阳从西边升起" 的可能性是？','[{"text": "0", "correct": true, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "1/2", "correct": false, "icon": ""}, {"text": "不确定", "correct": false, "icon": ""}]','0',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','抽屉里 3 红 2 白，摸出红球的可能性？','[{"text": "3/5", "correct": true, "icon": ""}, {"text": "2/5", "correct": false, "icon": ""}, {"text": "1/5", "correct": false, "icon": ""}, {"text": "3/2", "correct": false, "icon": ""}]','3/5',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','底面积 20、高 5 的圆柱体积是？','[{"text": "100", "correct": true, "icon": ""}, {"text": "25", "correct": false, "icon": ""}, {"text": "40", "correct": false, "icon": ""}, {"text": "50", "correct": false, "icon": ""}]','100',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','底面半径 3、高 4 的圆锥体积约是？（π取3.14）','[{"text": "37.68", "correct": true, "icon": ""}, {"text": "113.04", "correct": false, "icon": ""}, {"text": "75.36", "correct": false, "icon": ""}, {"text": "50.24", "correct": false, "icon": ""}]','37.68',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','-8 的相反数是？','[{"text": "8", "correct": true, "icon": ""}, {"text": "-8", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}, {"text": "80", "correct": false, "icon": ""}]','8',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','温度从 -2℃ 升到 3℃，升高了？','[{"text": "5℃", "correct": true, "icon": ""}, {"text": "3℃", "correct": false, "icon": ""}, {"text": "2℃", "correct": false, "icon": ""}, {"text": "1℃", "correct": false, "icon": ""}]','5℃',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','图上 2 厘米代表实际 100 米，比例尺是？','[{"text": "1:5000", "correct": true, "icon": ""}, {"text": "1:500", "correct": false, "icon": ""}, {"text": "1:50", "correct": false, "icon": ""}, {"text": "1:50000", "correct": false, "icon": ""}]','1:5000',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','圆柱有（ ）个底面','[{"text": "2", "correct": true, "icon": ""}, {"text": "1", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}]','2',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','圆锥有（ ）个顶点','[{"text": "1", "correct": true, "icon": ""}, {"text": "2", "correct": false, "icon": ""}, {"text": "3", "correct": false, "icon": ""}, {"text": "0", "correct": false, "icon": ""}]','1',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','6 个面都是正方形的立体图形是？','[{"text": "正方体", "correct": true, "icon": ""}, {"text": "长方体", "correct": false, "icon": ""}, {"text": "圆柱", "correct": false, "icon": ""}, {"text": "圆锥", "correct": false, "icon": ""}]','正方体',1,1,1),
('math','PRIMARY_6','choice','negative_scale','负数与比例尺','扇形统计图适合表示？','[{"text": "各部分所占比例", "correct": true, "icon": ""}, {"text": "增减变化", "correct": false, "icon": ""}, {"text": "数量多少", "correct": false, "icon": ""}, {"text": "分布情况", "correct": false, "icon": ""}]','各部分所占比例',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);

-- PRIMARY_6 yuwen（名著与习作）
INSERT INTO questions (subject, education, q_type, group_id, group_name, prompt, options, answer, level, points, status) VALUES
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','《西游记》中"大闹天宫"的是？','[{"text": "孙悟空", "correct": true, "icon": ""}, {"text": "猪八戒", "correct": false, "icon": ""}, {"text": "沙僧", "correct": false, "icon": ""}, {"text": "唐僧", "correct": false, "icon": ""}]','孙悟空',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','《红楼梦》中林黛玉的特点是？','[{"text": "多愁善感", "correct": true, "icon": ""}, {"text": "豪爽大方", "correct": false, "icon": ""}, {"text": "勇猛善战", "correct": false, "icon": ""}, {"text": "老实忠厚", "correct": false, "icon": ""}]','多愁善感',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','《三国演义》中"桃园三结义"是？','[{"text": "刘备关羽张飞", "correct": true, "icon": ""}, {"text": "刘备曹操孙权", "correct": false, "icon": ""}, {"text": "关羽张飞赵云", "correct": false, "icon": ""}, {"text": "刘备诸葛亮庞统", "correct": false, "icon": ""}]','刘备关羽张飞',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','《水浒传》中"武松打虎"打的是？','[{"text": "老虎", "correct": true, "icon": ""}, {"text": "豹子", "correct": false, "icon": ""}, {"text": "狮子", "correct": false, "icon": ""}, {"text": "狼", "correct": false, "icon": ""}]','老虎',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','《西游记》唐僧取经的目的地是？','[{"text": "西天（印度）", "correct": true, "icon": ""}, {"text": "东土大唐", "correct": false, "icon": ""}, {"text": "女儿国", "correct": false, "icon": ""}, {"text": "花果山", "correct": false, "icon": ""}]','西天（印度）',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','作文开头"开门见山" 是指？','[{"text": "开头直接点明主题", "correct": true, "icon": ""}, {"text": "开门看到山", "correct": false, "icon": ""}, {"text": "先写环境", "correct": false, "icon": ""}, {"text": "先写人物", "correct": false, "icon": ""}]','开头直接点明主题',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','作文"详略得当" 是指？','[{"text": "重点详写，次要略写", "correct": true, "icon": ""}, {"text": "全部详写", "correct": false, "icon": ""}, {"text": "全部略写", "correct": false, "icon": ""}, {"text": "平均用力", "correct": false, "icon": ""}]','重点详写，次要略写',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','"大江东去，浪淘尽" 出自苏轼的《》？','[{"text": "念奴娇·赤壁怀古", "correct": true, "icon": ""}, {"text": "水调歌头", "correct": false, "icon": ""}, {"text": "江城子", "correct": false, "icon": ""}, {"text": "定风波", "correct": false, "icon": ""}]','念奴娇·赤壁怀古',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','"但愿人长久" 的下一句是？','[{"text": "千里共婵娟", "correct": true, "icon": ""}, {"text": "千里共明月", "correct": false, "icon": ""}, {"text": "万里共婵娟", "correct": false, "icon": ""}, {"text": "千里同婵娟", "correct": false, "icon": ""}]','千里共婵娟',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','"零落成泥碾作尘" 的下一句是？','[{"text": "只有香如故", "correct": true, "icon": ""}, {"text": "只有香如初", "correct": false, "icon": ""}, {"text": "依然香如故", "correct": false, "icon": ""}, {"text": "只有香依旧", "correct": false, "icon": ""}]','只有香如故',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','文房四宝是？','[{"text": "笔墨纸砚", "correct": true, "icon": ""}, {"text": "琴棋书画", "correct": false, "icon": ""}, {"text": "梅兰竹菊", "correct": false, "icon": ""}, {"text": "诗词歌赋", "correct": false, "icon": ""}]','笔墨纸砚',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','"梅兰竹菊" 被称为？','[{"text": "四君子", "correct": true, "icon": ""}, {"text": "四美人", "correct": false, "icon": ""}, {"text": "四才子", "correct": false, "icon": ""}, {"text": "四雅士", "correct": false, "icon": ""}]','四君子',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','春节的传统习俗是？','[{"text": "贴春联放鞭炮", "correct": true, "icon": ""}, {"text": "吃粽子赛龙舟", "correct": false, "icon": ""}, {"text": "赏月吃月饼", "correct": false, "icon": ""}, {"text": "登高插茱萸", "correct": false, "icon": ""}]','贴春联放鞭炮',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','端午节纪念的是？','[{"text": "屈原", "correct": true, "icon": ""}, {"text": "孔子", "correct": false, "icon": ""}, {"text": "岳飞", "correct": false, "icon": ""}, {"text": "文天祥", "correct": false, "icon": ""}]','屈原',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','重阳节的传统活动是？','[{"text": "登高赏菊", "correct": true, "icon": ""}, {"text": "吃粽子", "correct": false, "icon": ""}, {"text": "赏月", "correct": false, "icon": ""}, {"text": "贴春联", "correct": false, "icon": ""}]','登高赏菊',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','《春望》"国破山河在" 的作者是？','[{"text": "杜甫", "correct": true, "icon": ""}, {"text": "李白", "correct": false, "icon": ""}, {"text": "王维", "correct": false, "icon": ""}, {"text": "白居易", "correct": false, "icon": ""}]','杜甫',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','"感时花溅泪" 的下一句是？','[{"text": "恨别鸟惊心", "correct": true, "icon": ""}, {"text": "恨别鸟惊飞", "correct": false, "icon": ""}, {"text": "思亲鸟惊心", "correct": false, "icon": ""}, {"text": "离别鸟惊心", "correct": false, "icon": ""}]','恨别鸟惊心',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','习作中"首尾呼应" 的好处是？','[{"text": "结构完整", "correct": true, "icon": ""}, {"text": "字数多", "correct": false, "icon": ""}, {"text": "内容丰富", "correct": false, "icon": ""}, {"text": "语句优美", "correct": false, "icon": ""}]','结构完整',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','"有志者事竟成" 出自？','[{"text": "后汉书", "correct": true, "icon": ""}, {"text": "论语", "correct": false, "icon": ""}, {"text": "史记", "correct": false, "icon": ""}, {"text": "孟子", "correct": false, "icon": ""}]','后汉书',1,1,1),
('yuwen','PRIMARY_6','choice','mingzhu_xiezuo','名著与习作','"老骥伏枥，志在千里" 的作者是？','[{"text": "曹操", "correct": true, "icon": ""}, {"text": "刘备", "correct": false, "icon": ""}, {"text": "孙权", "correct": false, "icon": ""}, {"text": "诸葛亮", "correct": false, "icon": ""}]','曹操',1,1,1)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt);