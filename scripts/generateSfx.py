"""Original synthesized city sounds. Requires ffmpeg (build-time only); deterministic, no sampled recordings."""
from pathlib import Path
import os, math, random, wave, struct, subprocess, tempfile, json
RATE=22050
OUT=Path('public/assets/audio');OUT.mkdir(parents=True,exist_ok=True)
DURATIONS={'click':.09,'place':.4,'demolish':.6,'road':.7,'milestone':1.3,'error':.24,'wind':4,'traffic':4,'birds':4,'voices':4,'industry':4,'water':4}
ffmpeg=os.environ.get('FFMPEG_BIN','ffmpeg');meta=[]
for index,(name,duration) in enumerate(DURATIONS.items()):
 rng=random.Random(11456+index);n=int(RATE*duration);pcm=[];low=0
 for i in range(n):
  t=i/RATE;noise=rng.uniform(-1,1);low=.94*low+.06*noise;envelope=min(1,t/.012,(duration-t)/.08)
  sine=lambda hz:math.sin(2*math.pi*hz*t)
  if name=='click': value=.22*sine(740)*math.exp(-t*45)
  elif name=='place':value=.4*sine(82)*math.exp(-t*12)+low*.4*math.exp(-t*8)
  elif name=='demolish':value=noise*.17*math.exp(-t*5)*(1+math.sin(t*130))
  elif name=='road':value=low*.65*(.6+.4*math.sin(t*25))
  elif name=='milestone':value=sum(math.sin(2*math.pi*f*(t-k*.13))*max(0,min(1,(t-k*.13)*25))*math.exp(-max(0,t-k*.13)*2) for k,f in enumerate([261.63,329.63,392,523.25]) if t>=k*.13)*.13
  elif name=='error':value=.2*sine(150)*math.exp(-t*9)
  elif name=='wind':value=low*.5*(.75+.25*math.sin(t*2*math.pi/4))
  elif name=='traffic':value=low*.6+(.05*sine(64)+.025*sine(96))*(.5+.5*math.sin(t*math.pi/2))
  elif name=='birds':
   q=t%1.0;value=.12*math.sin(2*math.pi*(1800*q+1500*q*q))*math.exp(-q*15) if q<.35 else 0
  elif name=='voices':
   q=t%.8;pitch=140+20*math.sin(t*2);value=(.04*sine(pitch)+.03*sine(pitch*3)+.012*sine(pitch*7))*max(0,math.sin(q/.8*math.pi))
  elif name=='industry':value=.08*sine(55)+.04*sine(110)+low*.35*(.5+.5*math.sin(t*math.pi*8))
  else:value=low*.45+.03*math.sin(2*math.pi*(330*t+30*math.sin(t*12)))
  pcm.append(struct.pack('<h',int(max(-.95,min(.95,value*max(0,envelope)))*32767)))
 with tempfile.TemporaryDirectory() as d:
  wav=Path(d)/'sound.wav'
  with wave.open(str(wav),'wb') as w:w.setparams((1,2,RATE,n,'NONE','not compressed'));w.writeframes(b''.join(pcm))
  for ext,codec in [('ogg','libvorbis'),('mp3','libmp3lame')]:
   target=OUT/f'{name}.{ext}'
   subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(wav),'-codec:a',codec,'-b:a','64k',str(target)],check=True)
   assert target.stat().st_size<50000,(target,target.stat().st_size)
 meta.append({'id':name,'seconds':duration,'sampleRate':RATE,'original':True})
(OUT/'sfx.json').write_text(json.dumps(meta,indent=2)+'\n')
print(f'{len(meta)} original sounds, OGG + MP3, all files < 50 KB')
