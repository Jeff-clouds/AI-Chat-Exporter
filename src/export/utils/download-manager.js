/**
 * 文件下载管理器
 */

/**
 * 下载管理器类
 */
export class DownloadManager {
  download(content, filename, { extension, mimeType }) {
    const blob = new Blob([content], { type: mimeType });
    this._downloadBlob(blob, `${filename}.${extension}`);
  }

  /**
   * 下载Markdown文件
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名（不带扩展名）
   */
  downloadMarkdown(content, filename) {
    this.download(content, filename, { extension: 'md', mimeType: 'text/markdown;charset=utf-8' });
  }

  /**
   * 下载文本文件
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名（不带扩展名）
   */
  downloadText(content, filename) {
    this.download(content, filename, { extension: 'txt', mimeType: 'text/plain;charset=utf-8' });
  }

  /**
   * 下载Blob对象
   * @param {Blob} blob - Blob对象
   * @param {string} filename - 完整文件名
   * @private
   */
  _downloadBlob(blob, filename) {
    console.log('_downloadBlob called with filename:', filename);
    const reader = new FileReader();

    reader.onload = () => {
      console.log('FileReader onload, calling chrome.downloads.download');
      chrome.downloads.download({
        url: reader.result,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          this._showError('下载失败: ' + chrome.runtime.lastError.message);
        } else {
          console.log('Download started successfully, ID:', downloadId);
        }
      });
    };

    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      this._showError('文件创建失败: ' + reader.error.message);
    };

    reader.readAsDataURL(blob);
  }

  /**
   * 显示错误通知
   * @param {string} message - 错误消息
   * @private
   */
  _showError(message) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'public/assets/icon48.png',
      title: '导出失败',
      message: message
    });
  }
}

/**
 * 创建全局下载管理器实例
 */
export const downloadManager = new DownloadManager();
