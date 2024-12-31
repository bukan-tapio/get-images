import puppeteer from "puppeteer";
import { scrollPageToBottom } from 'puppeteer-autoscroll-down';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import https from 'https';

// Fungsi untuk mengunduh gambar
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const writeStream = fs.createWriteStream(filepath);
      response.pipe(writeStream);

      writeStream.on('finish', () => {
        writeStream.close();
        resolve();
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  const userName = "nick name user";
  const cookiss = "<cookies path>" 
  let browser;
  try {
    // Buat folder untuk menyimpan media jika belum ada
    const downloadFolder = './downloaded_media';
    try {
      await fsPromises.access(downloadFolder);
    } catch {
      await fsPromises.mkdir(downloadFolder);
    }

    browser = await puppeteer.launch({
      headless: false,
      executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    });
    const page = await browser.newPage();
    
    // Baca cookies dari file
    try {
      const cookiesString = await fsPromises.readFile(`${cookiss}`, 'utf-8');
      const cookies = JSON.parse(cookiesString);
      await page.setCookie(...cookies);
      console.log('Cookies berhasil dimuat');
    } catch (error) {
      console.error('Error saat memuat cookies:', error);
      return;
    }

    await page.goto(`https://x.com/${userName}/media`, {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    // Verifikasi login
    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('[data-testid="loginButton"]');
    });

    if (!isLoggedIn) {
      console.log('Login gagal - cookies mungkin expired');
      return;
    }

    // Ambil jumlah media dari header
    const totalMedia = await page.evaluate(() => {
      const mediaText = document.evaluate(
        "//text()[contains(., 'foto & video')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
      if (mediaText) {
        const match = mediaText.textContent.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      }
      return 0;
    });

    console.log(`Total media yang perlu diload: ${totalMedia}`);
    if (totalMedia === 0) {
      console.log('Tidak dapat menemukan jumlah media atau tidak ada media');
      return;
    }

    const mediaPerScroll = 33;
    const estimatedScrolls = Math.ceil((totalMedia * 0.7) / mediaPerScroll);
    console.log(`Perkiraan scroll yang dibutuhkan: ${estimatedScrolls}`);

    let currentMediaCount = 0;
    let scrollCount = 0;
    let processedUrls = new Set(); // Untuk mencegah duplikasi

    // Fungsi untuk mengekstrak media URLs
    const extractMediaUrls = async () => {
      return await page.evaluate(() => {
        const mediaElements = document.querySelectorAll('div[data-testid="cellInnerDiv"] img[src*="media"]');
        return Array.from(mediaElements).map(img => {
          let url = img.src;
          // Ubah format URL untuk mendapatkan kualitas yang lebih tinggi
          url = url.replace(/&name=\w+$/, '&name=large');
          return url;
        });
      });
    };

    while (scrollCount < estimatedScrolls) {
      try {
        await scrollPageToBottom(page, {
          size: 500,
          delay: 500
        });
        
        await page.evaluate(() => {
          return new Promise(resolve => setTimeout(resolve, 1000));
        });

        // Ekstrak URL media baru
        const newMediaUrls = await extractMediaUrls();
        
        // Download media yang belum diproses
        for (const url of newMediaUrls) {
          if (!processedUrls.has(url)) {
            processedUrls.add(url);
            
            // Buat nama file dari URL
            const filename = `image_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const filepath = path.join(downloadFolder, filename);
            
            try {
              await downloadImage(url, filepath);
              console.log(`Berhasil mengunduh: ${filename}`);
            } catch (error) {
              console.error(`Gagal mengunduh ${url}:`, error);
            }
          }
        }

        currentMediaCount = processedUrls.size;
        console.log(`Scrolling ${++scrollCount}/${estimatedScrolls}, Media terunduh: ${currentMediaCount}/${totalMedia}`);

        try {
          await page.waitForNetworkIdle({
            timeout: 5000,
            idleTime: 1000
          });
        } catch (error) {
          console.log("Continuing after network timeout...");
        }

        if (currentMediaCount >= totalMedia) {
          console.log('Semua media telah diunduh!');
          break;
        }
      } catch (scrollError) {
        console.error("Error saat scrolling:", scrollError);
        continue;
      }
    }

    console.log(`Selesai! Total media yang diunduh: ${currentMediaCount}`);
    await browser.close();
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
    if (browser) await browser.close();
  }
}

main();