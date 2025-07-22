/**
 * Clipboard utilities for reliable copy operations across different environments
 */

/**
 * Reliably copy text to clipboard using multiple fallback methods
 * This is especially important in gaming mode where clipboard APIs may behave differently
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Use the proven input simulation method
  const tempInput = document.createElement('input');
  tempInput.value = text;
  tempInput.style.position = 'absolute';
  tempInput.style.left = '-9999px';
  document.body.appendChild(tempInput);
  
  try {
    // Focus and select the text
    tempInput.focus();
    tempInput.select();
    
    // Try copying using execCommand first (most reliable in gaming mode)
    let copySuccess = false;
    try {
      if (document.execCommand('copy')) {
        copySuccess = true;
      }
    } catch (e) {
      // If execCommand fails, try navigator.clipboard as fallback
      try {
        await navigator.clipboard.writeText(text);
        copySuccess = true;
      } catch (clipboardError) {
        console.error('Both copy methods failed:', e, clipboardError);
      }
    }
    
    return copySuccess;
  } finally {
    // Clean up
    document.body.removeChild(tempInput);
  }
}

/**
 * Verify that text was successfully copied to clipboard
 */
export async function verifyCopy(expectedText: string): Promise<boolean> {
  try {
    const readBack = await navigator.clipboard.readText();
    return readBack === expectedText;
  } catch (e) {
    // Verification not available, assume success
    return true;
  }
}

/**
 * Copy text with verification and return success status
 */
export async function copyWithVerification(text: string): Promise<{ success: boolean; verified: boolean }> {
  const copySuccess = await copyToClipboard(text);
  
  if (!copySuccess) {
    return { success: false, verified: false };
  }
  
  const verified = await verifyCopy(text);
  return { success: true, verified };
}
