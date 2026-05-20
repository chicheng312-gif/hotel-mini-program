# 微信小程序-酒店本地特产小商城

## 本地开发配置（AppID）

AppID 放在 **`project.private.config.json`**（已加入 `.gitignore`，不会上传到 GitHub）。

首次克隆仓库后：

```bash
copy project.private.config.example.json project.private.config.json
```

然后编辑 `project.private.config.json`，把 `appid` 改成你的小程序 AppID，再用微信开发者工具打开项目。

`project.config.json` 仅保留团队共享的编译、目录等配置，不含 AppID。
