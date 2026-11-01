# 素材工坊源码

[完整项目说明、接口、模拟演示、测试和部署方法见根目录 README](../README.md)。

在当前 source/ 目录执行：

```bash
test -f .env || cp .env.example .env
docker compose up --build -d --wait --wait-timeout 180
```

打开 [http://localhost:3000](http://localhost:3000)，自行注册账号开始使用。
