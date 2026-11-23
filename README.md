# blog
My personal blog

## 文章分类

文章开头的 YAML 信息使用 `category` 指定目录分类：

- `category: "关于我"`：自我介绍，目录中的“关于我”直接打开这篇文章（标题保持“关于我”）。
- `category: "感想与思考"`：作品感想、生活思考等；未填写分类的普通文章也归入这里。
- `category: "项目"`：MAD 等个人项目。

例如：

```yaml
---
layout: post
title: "文章标题"
category: "感想与思考"
---
```

分类内按文章日期从新到旧排列，目录只显示标题与日期。分类名称需与上述名称一致。
