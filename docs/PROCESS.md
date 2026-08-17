# PROCESS.md —— PRD 驱动六步闭环

> 本文档定义 @jiang_quan_ming/react-code-diff 的推进管理办法（Rondo 方法）。
> 铁律：**先 PRD，后开发**——任何阶段没有定稿（approved）的 PRD 不开工。

## 1. 六步闭环

```
立项 → 评审 → 开发 → 验证 → 收尾 → 发布
```

| 步骤 | 动作 | 产物 / 状态 |
|---|---|---|
| 1. 立项 | 从 `docs/TODO.yaml` 选定阶段，标 `in_progress`，撰写 PRD | `docs/prd/PRD-<阶段>-<名称>.md`（草稿） |
| 2. 评审 | 逐条核对需求与验收标准，定稿 | PRD 状态：`approved`（定稿后冻结，变更走「变更记录」） |
| 3. 开发 | 按 PRD 实现；分支 `feature/<阶段>-<任务>` | 代码 + 测试；PRD 状态：开发中 |
| 4. 验证 | 对照 PRD「验收标准」逐条执行（tsc / vitest / build:lib / 手动） | 全部通过 → 收尾；失败 → 回开发 |
| 5. 收尾 | **三联动缺一不可**：PRD 标 `已验收` + TODO 标 `done` + CHANGELOG 追加 | push feature 分支 → GitHub PR 合入 develop |
| 6. 发布 | release 分支 + 版本冻结 + 回归 + tag | `release/<ver>` → main + tag（见 AGENTS.md 发布流程） |

## 2. PRD 生命周期状态机

```
草稿 → 评审 → approved → 开发中 → 已验收
```

需求变更随时可能打断主流程，按双路径分流：

- **路径 A（新开 PRD）**：新 TODO 阶段 / 跨阶段 / 全新方向 / 范围超出原 PRD 边界
  → 复制模板新建 `PRD-<阶段>-<名称>.md`，回到【立项】
- **路径 B（修改原 PRD）**：同阶段内、同主题增量 / 对原 FR·AC 的细化修正
  → 改正文 + **必须**在末尾「变更记录」追加（日期 + 变更内容 + 理由）+ 重新核对受影响 AC

没有变更记录的 PRD 漂移 = 体系失效。

## 3. 分支与提交

- 分支模型：`main`（仅发布）← `develop`（集成分支，只接受 PR）← `feature/<阶段>-<任务>` / `prd-update` / `todos-update` / `release/<ver>` / `hotfix/<name>`
- 全 PR 流：所有合入 develop 的改动一律走 GitHub PR；本地永不 merge develop
- 提交格式：`<type>(<scope>): <subject>`（subject 中文）
  - type 白名单：feat / fix / prd / todos / docs / refactor / test / style / chore / perf
  - feat / fix / prd / todos 的 scope 必须是 TODO 真实阶段 id（hook 强制）
  - feat 额外强制：暂存必须包含对应阶段 PRD（hook 强制）
  - 其他 type 的 scope 用模块名（core / engine / virtual / hotkey / theme / demo / docs / hooks / release）
- 规范不靠自觉：`.githooks/` 本地 hook 强制（`git config core.hooksPath .githooks`）

## 4. 存量项目反推（已执行）

本项目在建立规范前已有 8 个提交。反推流程：git log 梳理演进 → 按里程碑分阶段 → 补 TODO（历史标 done）。历史阶段（A1~A3）不补写 PRD——反推不是编造，验收标准以当时的测试与提交记录为准。

## 5. 标准工作流（每次任务）

```bash
git checkout develop && git pull
git checkout -b feature/<阶段id>-<任务>
# 开发 + 测试（npx tsc --noEmit && npm test）
git add ... && git commit -m "feat(<阶段id>): 描述"
git push origin feature/<阶段id>-<任务>
# GitHub 提 PR → 服务器端合入 develop
git checkout develop && git pull
```
