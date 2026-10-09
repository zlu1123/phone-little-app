# Ponytail 安装记录

| 项 | 值 |
| --- | --- |
| 来源 | https://github.com/DietrichGebert/ponytail |
| 版本 | v5.1.0 |
| commit | `9cc65d03aa2da1db7121b912d03596409ee340b8`(2026-10-08) |
| 安装方式 | 指令/技能模式(DSH 约定),非 npm 依赖 |
| 安装时间 | 2026-10-09 |

## 装了什么

- `.dsh/skills/ponytail/SKILL.md` — 常驻模式本体(最小改动、lazy senior dev)
- `.dsh/skills/ponytail-review/SKILL.md` — 代码评审
- `.dsh/skills/ponytail-audit/SKILL.md` — 整仓审计
- `.dsh/skills/ponytail-debt/SKILL.md` — `shortcut:` 债务台账
- `.dsh/skills/ponytail-gain/SKILL.md` — 收益看板
- `.dsh/skills/ponytail-help/SKILL.md` — 命令速查
- `AGENTS.md`(项目根)— 常驻规则,每次会话注入

## 生效条件

DSH 按「最近的含 `.git` 的祖先目录」判定项目根,再扫描 `<项目根>/.dsh/skills` 和 `<项目根>/AGENTS.md`。
本项目 `phone-little-app` 自身是 git 仓库,所以**会话工作目录需要在该目录(或其子目录)内**才会加载。

## 升级

```bash
git clone --depth 1 https://github.com/DietrichGebert/ponytail.git /tmp/ponytail
cp -R /tmp/ponytail/skills/{ponytail,ponytail-review,ponytail-audit,ponytail-debt,ponytail-gain,ponytail-help} .dsh/skills/
cp /tmp/ponytail/AGENTS.md ./AGENTS.md
```

## 卸载

删除 `.dsh/skills/` 下 6 个 ponytail 技能目录、`AGENTS.md`,以及本文件。
