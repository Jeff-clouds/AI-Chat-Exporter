document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup loaded');
    const downloadButton = document.getElementById('download');
    if (downloadButton) {
        console.log('Download button found');
        downloadButton.addEventListener('click', async () => {
            console.log('Button clicked');
            try {
                // Get current tab
                console.log('Getting current tab...');
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) {
                    console.error('No active tab found');
                    alert('Cannot find current tab, please try again.');
                    return;
                }
                console.log('Current tab URL:', tab.url);

                // Check if it's a supported website
                const supportedSites = [
                    'deepseek.com',
                    'deepseek.ai',
                    'yuanbao.tencent.com',
                    'chatgpt.com',
                    'doubao.com',
                    'gemini.google.com',
                    'grok.com',
                    'kimi.com',
                    'moonshot.cn'
                ];
                const isSupported = supportedSites.some(site => tab.url.includes(site));

                if (!isSupported) {
                    alert('This extension only supports DeepSeek, YuanBao AI, ChatGPT, Doubao, Gemini, Grok, and Kimi.\nPlease open the corresponding chat page first.');
                    return;
                }

                // Show loading state
                downloadButton.textContent = 'Exporting...';
                downloadButton.disabled = true;

                console.log('Sending message to background script...');
                chrome.runtime.sendMessage({ action: "download" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Runtime error:', chrome.runtime.lastError);
                        alert('Export failed: ' + chrome.runtime.lastError.message);
                        resetButton();
                        return;
                    }
                    console.log('Message sent successfully, response:', response);
                    if (response && response.success) {
                        console.log('Export successful!');
                    } else if (response && !response.success) {
                        console.error('Export failed with error:', response.error);
                        alert('Export failed: ' + (response.error || 'Unknown error'));
                    }
                    resetButton();
                });

                // Reset button after 10 seconds (prevent long timeout)
                setTimeout(() => {
                    console.log('Timeout reached, resetting button...');
                    resetButton();
                }, 10000);
            } catch (error) {
                console.error('Error in click handler:', error);
                alert('Error during export: ' + error.message);
                resetButton();
            }
        });
    } else {
        console.error("Download button not found!");
    }
});

function resetButton() {
    const downloadButton = document.getElementById('download');
    if (downloadButton) {
        downloadButton.textContent = 'Export Chat';
        downloadButton.disabled = false;
    }
}
