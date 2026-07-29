# 怎么接手这份代码

基线：`origin/master` @ `2b875d2dec`
目标分支：`Canvas+editor`
路由：`/creative/creativestudio/canvas`

## 一行命令

在 `creative-tool-emo` 仓库根目录：

```bash
git checkout -b Canvas+editor origin/master && git apply /path/to/canvas-feature.patch
```

补丁已验证可以干净地打在 `origin/master` 上（25 个文件，含全部新文件）。

如果你的 master 比 `2b875d2dec` 新，遇到冲突用三方合并：

```bash
git apply -3 /path/to/canvas-feature.patch
```

## 跑起来

```bash
npx emo run dev --filter creative-cue
```

`edenx dev` 会自动拉起 Eden Proxy 并接管系统 PAC，把 `ads.tiktok.com/creative/creativestudio` 指向本地 8000 端口。然后在浏览器打开：

```
https://ads.tiktok.com/creative/creativestudio/canvas
```

**注意**：必须走 `ads.tiktok.com`，不能直接开 `localhost:8000` —— 那样会绕过 proxy 的 rewrite，接口全部 404，页面白屏。

浏览器报 `ERR_PROXY_CONNECTION_FAILED` 就是 dev server 没跑（PAC 还指着已经死掉的端口），重新起 dev server 即可。

## 跑测试

```bash
cd apps/web/creative-cue
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/edenx test src/pages/canvas
```

当前 26 个用例全过。

## 如果 dev server 起不来

`emo` 会先拓扑预构建依赖包，`node_modules` 不新的话会报一个**误导性**的叶子依赖错误（例如 `Cannot find module 'lodash-es'`）。先装依赖：

```bash
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" npx emo install
```

那个 `NODE_OPTIONS` 前缀是必要的，否则 node 会挑到坏掉的 IPv6 去连 bnpm，装到一半 ECONNRESET。

## 包里还有什么

- `canvas-feature.patch` —— 全部改动，一个文件搞定
- `src/**` —— 同样的新文件，按仓库路径摊开，方便直接看代码
- `modified/**` —— 两个原地改动文件的完整版本（侧边导航加 Canvas 入口）
- `README.md` —— 结构、后端接入情况、仓库踩坑清单

`src/**` 和 `modified/**` 只是为了方便阅读，**打补丁不需要它们**。
