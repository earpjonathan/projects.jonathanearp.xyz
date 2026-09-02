"""Side-by-side: source footage (undistorted proxy) | reconstruction rendered
from the same recorded pose. Both 640x480; the proxy was undistorted into the
same pinhole camera the render uses, so they are directly comparable."""
import argparse, json, os, sys
import numpy as np

def paths():
    """The renderers live in the fpv-splat repo; the media lives here. Both are
    arguments so this runs on a machine where neither sits where mine does."""
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=os.environ.get("FPV_SPLAT",
                    os.path.expanduser("~/Desktop/fpv-splat")),
                    help="root of the fpv-splat repo")
    ap.add_argument("--out", default=os.path.abspath(
                    os.path.join(here, "..", "..", "splat", "media")),
                    help="where the media files are written")
    a = ap.parse_args()
    sys.path.insert(0, os.path.join(a.project, "scripts"))
    os.chdir(a.project)
    os.makedirs(a.out, exist_ok=True)
    return a.project, a.out

PROJECT, OUT = paths()

from raster import load_splat, sigma_world, render
from PIL import Image
import multiprocessing as mp

SC = os.environ.get("SPLAT_SCRATCH", "/tmp/fpv-flythrough")
os.makedirs(f'{SC}/src', exist_ok=True)
os.makedirs(f'{SC}/out', exist_ok=True)
CLIP, T0, DUR, FPS, W, H = '0057', 198.0, 14.0, 30.0, 640, 480

xyz, sc, rgba, rot = load_splat('viewer/merged_web.splat')
S3 = sigma_world(sc, rot)
tr = json.load(open('viewer/merged_traj.json'))
clip = [c for c in tr['clips'] if c['name'] == CLIP][0]
P = np.array(clip['pos']).reshape(-1, 3)
Q = np.array(clip['cam_quat']).reshape(-1, 4)
cams = json.load(open('viewer/merged_cameras.json'))
base = next(c for c in cams if c['img_name'].startswith(CLIP))

def qmat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

N = int(DUR * FPS)

def job(k):
    t = T0 + k / FPS
    kk = int(round((t - clip['t0']) / clip['dt']))
    cam = dict(position=P[kk].tolist(), rotation=qmat(Q[kk]).tolist(),
               fx=base['fx'], fy=base['fy'], width=base['width'], height=base['height'])
    img, acc, _ = render(xyz, S3, rgba, cam, W, H, znear=0.01, fade=True)
    src_i = int(round((t - T0) * 50.0)) + 1
    src = Image.open(f'{SC}/fly/src/{src_i:04d}.jpg').convert('RGB').resize((W, H), Image.LANCZOS)
    out = Image.new('RGB', (W * 2, H))
    out.paste(src, (0, 0))
    out.paste(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)), (W, 0))
    out.save(f'{SC}/fly/out/{k:04d}.jpg', quality=90)
    return k

if __name__ == '__main__':
    mp.set_start_method('fork')
    with mp.Pool(6) as p:
        for i, k in enumerate(p.imap_unordered(job, range(N), chunksize=4)):
            if i % 20 == 0:
                print(f'{i}/{N}', flush=True)
    print('DONE', flush=True)
