// pages/agreement/agreement.js
Page({
  data: {
    type: '', // 'user' 用户协议 | 'privacy' 隐私政策
    title: '',
    content: '',
    statusBarHeight: 0
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight;

    const { type } = options;
    this.setData({
      type,
      statusBarHeight
    });

    if (type === 'user') {
      this.setData({ title: '用户服务协议' });
      wx.setNavigationBarTitle({ title: '用户服务协议' });
      this.loadUserAgreement();
    } else if (type === 'privacy') {
      this.setData({ title: '隐私政策' });
      wx.setNavigationBarTitle({ title: '隐私政策' });
      this.loadPrivacyPolicy();
    }
  },

  // 返回上一页
  handleBack() {
    wx.navigateBack({
      fail() {
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  },

  // 加载用户协议
  loadUserAgreement() {
    const content = `
      <h2 style="text-align:center;">用户服务协议</h2>
      <p><strong>生效日期：</strong>2024年1月1日</p>
      
      <h3>一、总则</h3>
      <p>1.1 本协议是您与使用本小程序服务的用户之间关于使用服务等相关事宜所订立的契约。</p>
      <p>1.2 在使用本小程序服务之前，请您仔细阅读本协议的全部内容。如您不同意本协议任意内容，请勿注册或使用本服务。</p>
      
      <h3>二、服务内容</h3>
      <p>2.1 本小程序提供手机IMEI查询、保修信息查询等服务。</p>
      <p>2.2 我们保留随时变更、中断或终止部分或全部服务的权利。</p>
      
      <h3>三、用户信息收集</h3>
      <p>3.1 为提供更好的服务，我们会收集您的以下信息：</p>
      <p>（1）微信昵称、头像等基本信息；</p>
      <p>（2）手机号码（用于账号注册和登录）；</p>
      <p>（3）设备IMEI、序列号（用于查询保修信息）。</p>
      <p>3.2 我们承诺对收集的个人信息严格保密，并仅用于提供服务之目的。</p>
      
      <h3>四、用户义务</h3>
      <p>4.1 用户应确保提供的个人信息真实、准确、完整。</p>
      <p>4.2 用户不得利用本服务从事任何违法或不当的活动。</p>
      
      <h3>五、隐私保护</h3>
      <p>5.1 保护用户个人信息是本小程序的一项基本原则。</p>
      <p>5.2 详情请查看《隐私政策》。</p>
      
      <h3>六、免责声明</h3>
      <p>6.1 本小程序提供的查询结果仅供参考，不构成任何保证。</p>
      <p>6.2 因网络状况、通讯线路等原因导致服务中断的，不承担责任。</p>
      
      <h3>七、协议修改</h3>
      <p>7.1 我们有权在必要时修改本协议条款。</p>
      <p>7.2 协议条款变更后，会在本小程序中公布修改内容。</p>
      
      <h3>八、法律适用</h3>
      <p>8.1 本协议的订立、执行和解释及争议的解决均适用中国法律。</p>
    `;
    
    this.setData({ content });
  },

  // 加载隐私政策
  loadPrivacyPolicy() {
    const content = `
      <h2 style="text-align:center;">隐私政策</h2>
      <p><strong>生效日期：</strong>2026年1月1日</p>
      
      <h3>一、我们收集的信息</h3>
      <p><strong>1. 个人信息</strong></p>
      <p>当您注册账号或使用我们的服务时，您可能需要提供：</p>
      <p>（1）<strong>微信信息</strong>：昵称、头像；</p>
      <p>（2）<strong>手机号码</strong>：用于账号注册和登录；</p>
      <p>（3）<strong>设备信息</strong>：IMEI、序列号（用于查询保修信息）。</p>
      
      <p><strong>2. 非个人信息</strong></p>
      <p>我们会自动接收并收集以下信息：</p>
      <p>（1）设备型号、操作系统版本；</p>
      <p>（2）日志信息：使用时长、点击记录等。</p>
      
      <h3>二、我们如何使用信息</h3>
      <p>1. 提供、维护、改进我们的服务；</p>
      <p>2. 处理您的查询请求（如IMEI查询）；</p>
      <p>3. 向您发送服务通知（不会发送营销信息）；</p>
      <p>4. 保护账号安全，防止欺诈。</p>
      
      <h3>三、信息共享与披露</h3>
      <p>1. 我们<strong>不会</strong>将您的个人信息出售给第三方。</p>
      <p>2. 仅在以下情况下共享信息：</p>
      <p>（1）获得您的明确同意；</p>
      <p>（2）根据法律法规要求；</p>
      <p>（3）为提供查询服务，向Apple等官方接口提交IMEI/序列号（仅用于查询保修信息）。</p>
      
      <h3>四、信息存储与安全</h3>
      <p>1. 您的信息存储在安全的服务器中，我们会采取合理措施保护您的信息安全。</p>
      <p>2. 我们将按照法律规定的最短期限存储您的信息。</p>
      
      <h3>五、您的权利</h3>
      <p>1. 您有权访问、更正您的个人信息；</p>
      <p>2. 您有权删除您的个人信息（联系客服）；</p>
      <p>3. 您有权注销账号（联系客服）。</p>
      
      <h3>六、未成年人保护</h3>
      <p>1. 我们非常重视对未成年人个人信息的保护。</p>
      <p>2. 如您为未成年人，请在监护人指导下使用本服务。</p>
      
      <h3>七、政策变更</h3>
      <p>1. 我们可能会不时更新本隐私政策。</p>
      <p>2. 变更后的隐私政策会在本小程序中公布。</p>
      
      <h3>八、联系我们</h3>
      <p>如您对本隐私政策有任何疑问，请联系我们：</p>
      <p>客服微信：SJHTWXRZ</p>
    `;
    
    this.setData({ content });
  }
});
