# Vant Weapp 安装说明

## 已完成配置

### 1. 创建 package.json
已创建 `package.json` 文件，包含 Vant Weapp 依赖。

### 2. 配置项目
已在以下文件中配置 Vant 组件：

- `pages/index/index.json` - 主页面引入 Vant 组件
- `pages/imei-query/imei-query.json` - IMEI查询页面引入 Vant 组件
- `project.private.config.json` - 配置 npm 构建路径

### 3. 已引入的组件

已配置以下 Vant 组件：
- `van-button` - 按钮
- `van-cell` - 单元格
- `van-cell-group` - 单元格组
- `van-field` - 输入框
- `van-uploader` - 上传组件
- `van-loading` - 加载中
- `van-toast` - 轻提示
- `van-dialog` - 弹出框
- `van-popup` - 弹出层
- `van-card` - 卡片
- `van-icon` - 图标
- `van-image` - 图片
- `van-tag` - 标签
- `van-divider` - 分割线

## 安装步骤

### 方式一：使用 npm 安装（推荐）

1. 在项目根目录打开终端

2. 安装依赖：
```bash
npm install
```

3. 在微信开发者工具中：
   - 点击菜单栏 `工具` -> `构建 npm`
   - 等待构建完成

4. 重新编译项目

### 方式二：使用 yarn 安装

1. 在项目根目录打开终端

2. 安装依赖：
```bash
yarn install
```

3. 在微信开发者工具中：
   - 点击菜单栏 `工具` -> `构建 npm`
   - 等待构建完成

4. 重新编译项目

## 使用示例

### 按钮
```html
<van-button type="primary" size="large" bindtap="handleClick">
  点击按钮
</van-button>
```

### 输入框
```html
<van-field
  value="{{ value }}"
  label="IMEI"
  placeholder="请输入IMEI"
  bind:change="onChange"
/>
```

### 上传组件
```html
<van-uploader
  file-list="{{ fileList }}"
  bind:after-read="afterRead"
  bind:delete="delete"
/>
```

### 弹出框
```html
<van-dialog
  show="{{ showDialog }}"
  title="提示"
  message="确定要删除吗？"
  show-cancel-button
  bind:confirm="onConfirm"
  bind:cancel="onCancel"
/>
```

## 完整文档

更多组件使用方法请参考官方文档：
https://vant-contrib.gitee.io/vant-weapp/#/home

## 常见问题

### 1. 构建 npm 后组件仍无法使用

检查 `project.private.config.json` 中的配置是否正确：
```json
{
  "setting": {
    "packNpmRelationList": [
      {
        "packageJsonPath": "./package.json",
        "miniprogramNpmDistDir": "./miniprogram_npm/"
      }
    ]
  }
}
```

### 2. 组件样式异常

确保已在 `app.wxss` 中导入 Vant 样式（可选，Vant Weapp 已经自带样式）

### 3. 某些组件不显示

检查页面 json 文件中是否正确引入了该组件。

## 注意事项

1. 微信开发者工具需要 1.02.1811150 或更高版本
2. 基础库版本需要 2.2.3 或更高版本
3. 构建完成后，`miniprogram_npm` 目录会自动生成
4. 如果修改了依赖，需要重新构建 npm
