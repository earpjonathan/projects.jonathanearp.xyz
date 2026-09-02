"""Static figures for the write-up, all rendered from the deployed asset."""
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

xyz, sc, rgba, rot = load_splat('viewer/merged_web.splat')
S3 = sigma_world(sc, rot)
cams = json.load(open('viewer/merged_cameras.json'))

# ---------- 1. the znear A/B pair, 900x675 ----------
def ab():
    cam = cams[2500]
    for tag, zn in (('old', 0.2), ('fix', 0.01)):
        img, acc, _ = render(xyz, S3, rgba, cam, 900, 675, znear=zn, fade=True)
        b = acc[450:]
        print(f'  znear {zn}: opacity {b.mean():.3f} holes {100*np.mean(b<0.5):.1f}%', flush=True)
        Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(
            f'{OUT}/znear_{tag}.jpg', quality=88, optimize=True)

# ---------- 2. a real per-pose distribution ----------
NP = 72
picks = list(range(0, len(cams), max(1, len(cams) // NP)))[:NP]

def one(ci):
    cam = cams[ci]
    r = {}
    for tag, zn in (('old', 0.2), ('fix', 0.01)):
        _, acc, _ = render(xyz, S3, rgba, cam, 480, 360, znear=zn, fade=True)
        b = acc[240:]
        r[tag] = round(float(100 * np.mean(b < 0.5)), 2)
    return ci, r

if __name__ == '__main__':
    ab()
    mp.set_start_method('fork')
    res = {}
    with mp.Pool(6) as p:
        for i, (ci, r) in enumerate(p.imap_unordered(one, picks, chunksize=2)):
            res[ci] = r
            if i % 10 == 0: print(f'  pose {i}/{len(picks)}', flush=True)
    old = [res[c]['old'] for c in picks]
    fix = [res[c]['fix'] for c in picks]
    json.dump(dict(ids=picks, old=old, fix=fix, w=480, h=360,
                   note='bottom-third hole fraction, CPU reference rasteriser, merged 3M asset'),
              open(f'{OUT}/poses.json', 'w'))
    a = np.array(old)
    print(f'  poses: mean {a.mean():.1f}% median {np.median(a):.1f}% max {a.max():.1f}% '
          f'above20 {int((a>20).sum())}/{len(a)}', flush=True)
    b = np.array(fix)
    print(f'  fixed: mean {b.mean():.2f}% max {b.max():.2f}%', flush=True)
    print('DONE', flush=True)
