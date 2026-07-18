
export const ensure16x9 = (imageBase64: string, targetWidth: number, targetHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            const w = img.width;
            const h = img.height;
            const targetRatio = targetWidth / targetHeight;
            const currentRatio = w / h;

            let sx = 0, sy = 0, sWidth = w, sHeight = h;

            if (Math.abs(currentRatio - targetRatio) > 1e-3) {
                if (currentRatio > targetRatio) { // Image is wider than target
                    sWidth = h * targetRatio;
                    sx = (w - sWidth) / 2;
                } else { // Image is taller than target
                    sHeight = w / targetRatio;
                    sy = (h - sHeight) / 2;
                }
            }
            
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
            resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = () => {
            reject(new Error('Failed to load image for processing.'));
        };
        img.src = imageBase64;
    });
};
