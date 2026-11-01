CREATE TABLE template_categories (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL
);

CREATE TABLE templates (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    category_id VARCHAR(64) NOT NULL,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    cover_url VARCHAR(255) NOT NULL,
    required_image_count TINYINT NOT NULL,
    sort_order INT NOT NULL,
    CONSTRAINT templates_category_fk FOREIGN KEY (category_id) REFERENCES template_categories (id),
    CONSTRAINT templates_image_count_ck CHECK (required_image_count IN (1, 2))
);

CREATE INDEX templates_category_order_idx ON templates (category_id, sort_order);

INSERT INTO template_categories (id, name, description, sort_order) VALUES
('creative', '创意图片', '让日常画面多一点想象。', 1),
('portrait', '人像写真', '用不同光线与色彩，表达你的个性。', 2),
('duo', '双人记忆', '把两个人的故事，收藏在同一张画面里。', 3);

INSERT INTO templates (id, category_id, title, description, cover_url, required_image_count, sort_order) VALUES
('paper-postcard', 'creative', '山海明信片', '把一次旅行的风景装进明信片。准备一张风景图片，用山峦、海岸与纸张质感收藏沿途的记忆。', '/api/catalog-assets/paper-postcard.svg', 1, 1),
('city-collage', 'creative', '城市拼贴', '用两张城市图片，拼出属于你的街头叙事。建筑、招牌或路边的一角，都可以成为画面中的灵感。', '/api/catalog-assets/city-collage.svg', 2, 2),
('editorial-portrait', 'portrait', '午后画报', '把日常人像放进一张暖色画报。准备一张清晰的单人照片，让柔和色彩衬托画面中的你。', '/api/catalog-assets/editorial-portrait.svg', 1, 3),
('neon-profile', 'portrait', '霓虹侧影', '以深色背景和霓虹光线，营造独特的人像氛围。建议使用一张主体清晰、轮廓完整的单人照片。', '/api/catalog-assets/neon-profile.svg', 1, 4),
('travel-duo', 'duo', '一起去远方', '为两个人准备一张共同旅行的纪念海报。分别上传一张人物照片，让两段日常在同一片风景中相遇。', '/api/catalog-assets/travel-duo.svg', 2, 5),
('instant-memories', 'duo', '拍立得日记', '把两张珍贵照片收藏成一页拍立得日记。朋友、家人或恋人的片刻，都值得留下自己的位置。', '/api/catalog-assets/instant-memories.svg', 2, 6);
