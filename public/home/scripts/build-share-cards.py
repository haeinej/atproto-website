"""Optional card authoring: Pillow + fontTools + Brotli. Pass the ohm-ui checkout to rebuild its card too."""
from pathlib import Path
import re, html, json, io
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[3]
import sys
ui=Path(sys.argv[1]) if len(sys.argv) > 1 else None
font=TTFont(root/'public/home/public/assets/fonts/coconat-regular.woff2'); font.flavor=None
buf=io.BytesIO();font.save(buf);fontbytes=buf.getvalue()
def card(path,kicker,lines,footer):
 im=Image.new('RGB',(1200,630),'#ffffff');d=ImageDraw.Draw(im)
 def f(s):return ImageFont.truetype(io.BytesIO(fontbytes),s)
 d.ellipse((72,65,102,95),fill='#013220');d.text((119,57),kicker,font=f(29),fill='#013220')
 for i,line in enumerate(lines):d.text((72,197+i*80),line,font=f(66),fill='#242424')
 d.line((72,523,1128,523),fill='#e5e5e5',width=2);d.text((72,548),footer,font=f(24),fill='#6b6b6b')
 path.parent.mkdir(parents=True,exist_ok=True);im.save(path)
card(root/'public/home/public/assets/og-home-v2.png','ohm',['Your home on the web,','connected.'],'Your website, your work, your people.  ·  ohmmmm.com')
card(root/'public/docs/assets/og-docs-v2.png','ohm docs',['Your workspace,','step by step.'],'Private drafts. Public posts. Your agent.  ·  docs.ohmmmm.com')
if ui: card(ui/'public/og-design-v1.png','ohm design system',['Foundations, components','and agent interface.'],'Built for ohm. Yours to use.  ·  design.ohmmmm.com')
