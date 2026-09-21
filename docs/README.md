# H5 文档地图

接收方 AI 先读根目录 `README.md`、`CHANGELOG.md` 和 `docs/RELEASE_PROCESS.md`。

## 当前有效

| 文档 | 用途 |
|---|---|
| `RELEASE_PROCESS.md` | 版本、构建、生产发布和回滚 |
| `H5接入商家后端-订单同步方案.md` | H5 与商家服务订单桥接 |
| `商家订单桥接-实现说明.md` | 当前桥接实现和约束 |
| `退款审核与订单同步-实施方案.md` | 退款与订单同步 |
| `测试环境使用说明.md` | 测试实例和验证流程 |
| `生产端改动记录.md` | 生产端历史改动 |
| `flower_shop数据源结构.md` | 商家数据源结构 |

## 设计与历史资料

HTML 效果稿、检查报告、支付迁移讨论和联调回复用于追溯设计决策，不作为生产部署命令来源。生产部署以 `deploy/README.md`、根 README 和 `RELEASE_PROCESS.md` 为准。

## 安全边界

- `deploy/patches/` 是可审计补丁源码，执行前必须在测试实例验证并备份。
- 不提交 `.env`、MySQL 客户端配置、服务令牌、支付密钥或证书私钥。
- H5 静态发布只重启 `twlh5-static`；`twlh5-api` 和 `flower-shop` 是真实订单服务，必须单独变更和验收。
