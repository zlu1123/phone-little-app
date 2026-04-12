const app = getApp();
const { API_ENDPOINTS, buildApiUrl } = require('../../config');

Page({
  data: {
    statusBarHeight: 0,
    mode: 'login', // 'login' | 'register'
    // 登录相关
    phone: '',
    password: '',
    agreed: true,
    showPhoneForm: true,
    isLoading: false,
    // 注册相关
    registerPhone: '',
    registerPassword: '',
    confirmPassword: ''
  },

  onLoad() {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20
    });
  },

  // 切换登录/注册模式
  handleSwitchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      mode,
      // 切换时清空表单
      phone: '',
      password: '',
      registerPhone: '',
      registerPassword: '',
      confirmPassword: '',
      showPhoneForm: false
    });
  },

  // 微信一键登录
  handleWechatLogin(e) {
    if (!this.data.agreed) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    if (e.detail.errMsg !== 'getUserInfo:ok') {
      wx.showToast({
        title: '已取消登录',
        icon: 'none'
      });
      return;
    }

    this.setData({ isLoading: true });

    // 获取用户信息
    const userInfo = e.detail.userInfo;

    // 调用微信登录获取 code
    wx.login({
      success: loginRes => {
        if (loginRes.code) {
          // 调用后端接口，传递 code 和 userInfo 进行登录
          wx.request({
            url: buildApiUrl(API_ENDPOINTS.login),
            method: 'POST',
            header: {
              'x-app-wechat': '5c89231b711447acbf995c28c435dc39',
              'content-type': 'application/json'
            },
            data: {
              code: loginRes.code,
              userInfo: userInfo
            },
            success: res => {
              const data = res.data || {};
              if (res.statusCode === 200 && data.code === 200) {
                // 后端返回成功
                this.mockLogin({
                  type: 'wechat',
                  userInfo: data.userInfo || userInfo,
                  phone: data.phone,
                  token: data.token
                });
              } else {
                wx.showToast({
                  title: data.msg || '登录失败，请重试',
                  icon: 'none'
                });
                this.setData({ isLoading: false });
              }
            },
            fail: () => {
              wx.showToast({
                title: '网络请求失败',
                icon: 'none'
              });
              this.setData({ isLoading: false });
            }
          });
        } else {
          wx.showToast({
            title: '登录失败，请重试',
            icon: 'none'
          });
          this.setData({ isLoading: false });
        }
      },
      fail: () => {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        });
        this.setData({ isLoading: false });
      }
    });
  },

  // 手机号快捷登录
  handlePhoneLogin(e) {
    if (!this.data.agreed) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({
        title: '已取消授权',
        icon: 'none'
      });
      return;
    }

    this.setData({ isLoading: true });

    // 获取手机号需要先调用 wx.login 获取 code
    wx.login({
      success: loginRes => {
        if (loginRes.code) {
          // 调用后端接口，传递 code 和 encryptedData/iv 解密手机号
          wx.request({
            url: buildApiUrl(API_ENDPOINTS.login),
            method: 'POST',
            header: {
              'x-app-wechat': '5c89231b711447acbf995c28c435dc39',
              'content-type': 'application/json'
            },
            data: {
              code: loginRes.code,
              encryptedData: e.detail.encryptedData,
              iv: e.detail.iv,
              type: 'phone'
            },
            success: res => {
              const data = res.data || {};
              if (res.statusCode === 200 && data.code === 200) {
                // 后端返回成功
                this.mockLogin({
                  type: 'phone',
                  phone: data.phone,
                  token: data.token,
                  userInfo: data.userInfo
                });
              } else {
                wx.showToast({
                  title: data.msg || '登录失败，请重试',
                  icon: 'none'
                });
                this.setData({ isLoading: false });
              }
            },
            fail: () => {
              wx.showToast({
                title: '网络请求失败',
                icon: 'none'
              });
              this.setData({ isLoading: false });
            }
          });
        } else {
          wx.showToast({
            title: '登录失败，请重试',
            icon: 'none'
          });
          this.setData({ isLoading: false });
        }
      },
      fail: () => {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        });
        this.setData({ isLoading: false });
      }
    });
  },

  // 手机号输入
  handlePhoneChange(e) {
    this.setData({ phone: e.detail });
  },

  // 密码输入
  handlePasswordChange(e) {
    this.setData({ password: e.detail });
  },

  // 手机号密码登录
  handlePasswordLogin() {
    if (!this.data.agreed) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    const { phone, password } = this.data;

    // 验证手机号
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    // 验证密码
    if (!password || password.length < 6) {
      wx.showToast({
        title: '密码长度至少6位',
        icon: 'none'
      });
      return;
    }

    this.setData({ isLoading: true });

    // 调用后端接口验证登录
    wx.request({
      url: buildApiUrl(API_ENDPOINTS.login),
      method: 'POST',
      header: {
        'x-app-wechat': '5c89231b711447acbf995c28c435dc39',
        'content-type': 'application/json'
      },
      data: {
        username: phone,
        password
      },
      success: res => {
        const data = res.data || {};
        if (res.statusCode === 200 && data.code === 200) {
          // 后端返回成功
          this.mockLogin({
            type: 'password',
            phone: data.phone || phone,
            token: data.token
          });
        } else {
          wx.showToast({
            title: data.msg || '登录失败，请检查账号密码',
            icon: 'none'
          });
          this.setData({ isLoading: false });
        }
      },
      fail: () => {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
        this.setData({ isLoading: false });
      }
    });
  },

  // 切换手机号表单
  togglePhoneForm() {
    this.setData({
      showPhoneForm: !this.data.showPhoneForm
    });
  },

  // ============ 注册相关方法 ============

  // 微信手机号快捷注册
  handleWechatPhoneRegister(e) {
    if (!this.data.agreed) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({
        title: '已取消授权',
        icon: 'none'
      });
      return;
    }

    this.setData({ isLoading: true });

    // 获取手机号需要先调用 wx.login 获取 code
    wx.login({
      success: loginRes => {
        if (loginRes.code) {
          // TODO: 调用后端接口，传递 code 和 encryptedData/iv 解密手机号进行注册
          this.mockRegister({
            type: 'wechat_phone',
            code: loginRes.code,
            encryptedData: e.detail.encryptedData,
            iv: e.detail.iv
          });
        } else {
          wx.showToast({
            title: '注册失败，请重试',
            icon: 'none'
          });
          this.setData({ isLoading: false });
        }
      },
      fail: () => {
        wx.showToast({
          title: '注册失败，请重试',
          icon: 'none'
        });
        this.setData({ isLoading: false });
      }
    });
  },

  // 注册手机号输入
  handleRegisterPhoneChange(e) {
    this.setData({ registerPhone: e.detail });
  },

  // 注册密码输入
  handleRegisterPasswordChange(e) {
    this.setData({ registerPassword: e.detail });
  },

  // 确认密码输入
  handleConfirmPasswordChange(e) {
    this.setData({ confirmPassword: e.detail });
  },

  // 手机号密码注册
  handleRegister() {
    if (!this.data.agreed) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    const { registerPhone, registerPassword, confirmPassword } = this.data;

    // 验证手机号
    if (!registerPhone || !/^1[3-9]\d{9}$/.test(registerPhone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    // 验证密码长度
    if (!registerPassword || registerPassword.length < 6) {
      wx.showToast({
        title: '密码长度至少6位',
        icon: 'none'
      });
      return;
    }

    // 验证密码长度上限
    if (registerPassword.length > 20) {
      wx.showToast({
        title: '密码长度不能超过20位',
        icon: 'none'
      });
      return;
    }

    // 验证两次密码是否一致
    if (registerPassword !== confirmPassword) {
      wx.showToast({
        title: '两次输入的密码不一致',
        icon: 'none'
      });
      return;
    }

    this.setData({ isLoading: true });

    // TODO: 调用后端接口进行注册
    this.mockRegister({
      type: 'phone_password',
      phone: registerPhone,
      password: registerPassword
    });
  },

  // 协议勾选
  handleAgreementChange(e) {
    this.setData({ agreed: e.detail });
  },

  // 查看协议
  handleViewAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.showToast({
      title: type === 'user' ? '用户协议' : '隐私政策',
      icon: 'none'
    });
    // TODO: 跳转到协议页面
    // wx.navigateTo({
    //   url: `/pages/agreement/agreement?type=${type}`
    // });
  },

  // 游客模式
  handleGuestLogin() {
    // 设置游客标识
    wx.setStorageSync('isGuest', true);
    wx.setStorageSync('isLoggedIn', false);

    wx.showToast({
      title: '已进入游客模式',
      icon: 'success'
    });

    setTimeout(() => {
      wx.switchTab({
        url: '/pages/imei-query/imei-query'
      });
    }, 1000);
  },

  // 模拟登录（实际开发中替换为真实接口）
  mockLogin(params) {
    console.log('登录参数:', params);

    // 模拟网络请求延迟
    setTimeout(() => {
      // 模拟登录成功
      const mockUserInfo = {
        nickName: params.userInfo?.nickName || '微信用户',
        avatarUrl: params.userInfo?.avatarUrl || '',
        phone: params.phone || '138****8888'
      };

      // 存储登录状态和用户信息
      wx.setStorageSync('isLoggedIn', true);
      wx.setStorageSync('isGuest', false);
      wx.setStorageSync('userInfo', mockUserInfo);

      // 缓存 token 和过期时间（模拟 24 小时后过期）
      const token = params.token || 'mock_token_' + Date.now();
      const expireTime = Date.now() + 24 * 60 * 60 * 1000;
      wx.setStorageSync('token', token);
      wx.setStorageSync('tokenExpireTime', expireTime);

      this.setData({ isLoading: false });

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      });

      // 跳转回上一页或首页
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.switchTab({
            url: '/pages/my/my'
          });
        }
      }, 1000);
    }, 1500);
  },

  // 模拟注册（实际开发中替换为真实接口）
  mockRegister(params) {
    console.log('注册参数:', params);

    // 模拟网络请求延迟
    setTimeout(() => {
      // 模拟注册成功
      const mockUserInfo = {
        nickName: '微信用户',
        avatarUrl: '',
        phone: params.phone || '138****8888'
      };

      // 存储登录状态和用户信息（注册成功后自动登录）
      wx.setStorageSync('isLoggedIn', true);
      wx.setStorageSync('isGuest', false);
      wx.setStorageSync('userInfo', mockUserInfo);

      // 缓存 token 和过期时间（模拟 24 小时后过期）
      const token = 'mock_token_' + Date.now();
      const expireTime = Date.now() + 24 * 60 * 60 * 1000;
      wx.setStorageSync('token', token);
      wx.setStorageSync('tokenExpireTime', expireTime);

      this.setData({ isLoading: false });

      wx.showToast({
        title: '注册成功',
        icon: 'success'
      });

      // 跳转回上一页或首页
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.switchTab({
            url: '/pages/my/my'
          });
        }
      }, 1000);
    }, 1500);
  }
});
