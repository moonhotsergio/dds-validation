const { chromium } = require('playwright');

async function inspectFigmaSite() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to Figma site...');
    await page.goto('https://power-skip-13985442.figma.site');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    console.log('Page loaded, extracting design information...');
    
    // Get page title
    const title = await page.title();
    console.log('Page title:', title);
    
    // Get all text content
    const textContent = await page.evaluate(() => {
      return document.body.innerText;
    });
    console.log('Text content:', textContent.substring(0, 500) + '...');
    
    // Get all elements and their styles
    const elements = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const elementInfo = [];
      
      allElements.forEach((el, index) => {
        if (index < 50) { // Limit to first 50 elements
          const styles = window.getComputedStyle(el);
          elementInfo.push({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            textContent: el.textContent?.substring(0, 100),
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            fontSize: styles.fontSize,
            width: styles.width,
            height: styles.height,
            position: styles.position,
            display: styles.display
          });
        }
      });
      
      return elementInfo;
    });
    
    console.log('Element analysis:', JSON.stringify(elements, null, 2));
    
    // Take a screenshot
    await page.screenshot({ path: 'figma-site.png', fullPage: true });
    console.log('Screenshot saved as figma-site.png');
    
  } catch (error) {
    console.error('Error inspecting site:', error);
  } finally {
    await browser.close();
  }
}

inspectFigmaSite(); 