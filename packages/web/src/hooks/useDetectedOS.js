import { useState, useEffect } from 'react';

function detectOS() {
  if (navigator.userAgentData?.platform) {
    const p = navigator.userAgentData.platform.toLowerCase();
    if (p.includes('win')) return 'windows';
    if (p.includes('mac') || p.includes('darwin')) return 'mac';
    if (p.includes('linux') || p.includes('cros')) return 'linux';
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';

  return null;
}

export function useDetectedOS() {
  const [os, setOs] = useState(detectOS);

  useEffect(() => {
    if (!navigator.userAgentData?.getHighEntropyValues) {
      setOs(detectOS());
      return;
    }

    navigator.userAgentData
      .getHighEntropyValues(['platform', 'platformVersion'])
      .then((values) => {
        const p = (values.platform || '').toLowerCase();
        if (p.includes('win')) setOs('windows');
        else if (p.includes('mac') || p.includes('darwin')) setOs('mac');
        else if (p.includes('linux') || p.includes('cros')) setOs('linux');
        else setOs(detectOS());
      })
      .catch(() => {
        setOs(detectOS());
      });
  }, []);

  return os;
}
