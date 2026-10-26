const puppeteer = require('puppeteer-core');
(async () => {
  const port = require('fs').readFileSync('/tmp/avport','utf8').trim();
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [], ext = [];
  for (const [path, vp] of [['/index.html',{width:390,height:844}],['/index.html',{width:1280,height:900}],['/sources.html',{width:390,height:844}]]) {
    const p = await b.newPage(); await p.setViewport(vp);
    p.on('console', m => { if (['error','warning'].includes(m.type())) errs.push(path+': '+m.text()); });
    p.on('pageerror', e => errs.push(path+' pageerror: '+e.message));
    p.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) ext.push(r.url()); });
    p.on('requestfailed', r => errs.push('failed '+r.url()));
    await p.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'networkidle0' });
    if (path === '/index.html') {
      await p.waitForFunction('window.__AV_READY === true', {timeout: 10000});
      const info = await p.evaluate(() => ({
        charts: Object.values(Chart.instances).map(c => ({ n: c.data.datasets.length, labels: c.data.datasets.map(d => d.label + ':' + d.data.length).slice(0,8) })),
        rows: document.querySelectorAll('#city-table tbody tr').length, events: document.querySelectorAll('#event-list li').length }));
      console.log(vp.width, JSON.stringify(info));
      await p.screenshot({ path: `/tmp/pp/shot_${vp.width}.png`, fullPage: vp.width>1000 });
      if (vp.width > 1000) {
        // exercise filters
        await p.select('#global-filters select[data-f="state"]', 'TX'); await new Promise(r=>setTimeout(r,300));
        await p.select('#global-filters select[data-f="city"]', 'Austin|TX'); await new Promise(r=>setTimeout(r,300));
        await p.click('#global-filters button[data-r="1Y"]'); await new Promise(r=>setTimeout(r,300));
        const i2 = await p.evaluate(() => ({ charts: Object.values(Chart.instances).map(c => c.data.datasets.map(d => d.label + ':' + d.data.length)), rows: document.querySelectorAll('#city-table tbody tr').length, events: document.querySelectorAll('#event-list li').length }));
        console.log('Austin 1Y', JSON.stringify(i2));
        await p.select('[data-chart="usage"] select[data-c="view"]', 'rate');
        await p.select('[data-chart="vehicles"] select[data-c="group"]', 'series');
        await p.select('[data-chart="status"] select[data-c="statusMode"]', 'cities');
        await p.select('#global-filters select[data-f="city"]', '');
        await p.select('#global-filters select[data-f="state"]', '');
        await p.click('#global-filters button[data-r="ALL"]');
        await p.select('[data-chart="area"] .local select[data-f="operator"]', 'waymo');
        await new Promise(r=>setTimeout(r,300));
        // click on a point in area chart
        const c = await p.$('[data-chart="area"] canvas'); const bb = await c.boundingBox();
        const pt = await p.evaluate(() => { const c = Object.values(Chart.instances).find(c => c.canvas.closest('[data-chart=area]')); const m = c.getDatasetMeta(0); const el = m.data[m.data.length-2]; return {x: el.x, y: el.y}; }); await p.mouse.click(bb.x + pt.x, bb.y + pt.y); await new Promise(r=>setTimeout(r,200));
        console.log('detail:', await p.evaluate(() => document.querySelector('[data-chart="area"] .detail').innerText.slice(0,300)));
        await p.screenshot({ path: `/tmp/pp/shot_after.png`, fullPage: true });
      }
    } else console.log('sources rows', await p.evaluate(() => document.querySelectorAll('#src-table tbody tr').length));
  }
  console.log('ERRORS', JSON.stringify(errs)); console.log('EXTERNAL', JSON.stringify(ext));
  await b.close();
})();
