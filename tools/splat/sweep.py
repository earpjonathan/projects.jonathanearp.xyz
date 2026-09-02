"""A real znear sweep: four capture poses, seven near planes, rendered and
measured. Also the in-frustum depth histogram each cut is eating into."""
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

os.makedirs(f'{OUT}/sweep', exist_ok=True)
xyz, sc, rgba, rot = load_splat('viewer/merged_web.splat')
S3 = sigma_world(sc, rot)
cams = json.load(open('viewer/merged_cameras.json'))

POSES = [6386, 5253, 2500, 4820]
ZN = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35]
W, H = 480, 360
ZFAR, MARGIN = 200.0, 1.2
def zcut(zn):
    k = ZFAR / (ZFAR - zn)
    return zn * k / (MARGIN + k)

def hist(ci):
    """opacity-weighted depth histogram of in-frustum splats, log bins"""
    c = cams[ci]
    C = np.asarray(c['position'], float); Rc = np.asarray(c['rotation'], float)
    Xc = (xyz - C) @ Rc
    z = Xc[:, 2]
    s = H / c['height']
    px = (2 * c['fx'] * s / W) * Xc[:, 0]
    py = -(2 * c['fy'] * s / H) * Xc[:, 1]
    clip = MARGIN * z
    inf = (z > 0) & (np.abs(px) <= clip) & (np.abs(py) <= clip)
    lz = np.log10(np.clip(z[inf], 1e-4, None))
    w = rgba[inf, 3]
    h, e = np.histogram(lz, bins=48, range=(-3.0, 1.2), weights=w)
    return h.tolist(), e.tolist()

def job(a):
    ci, zn = a
    _, acc, _ = render(xyz, S3, rgba, cams[ci], W, H, znear=zn, fade=True)
    b = acc[240:]
    return ci, zn, float(100 * np.mean(b < 0.5)), float(b.mean())

def shot(a):
    ci, zn = a
    img, _, _ = render(xyz, S3, rgba, cams[ci], W, H, znear=zn, fade=True)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((400, 300), Image.LANCZOS) \
        .save(f'{OUT}/sweep/{ci}_{str(zn).replace(".", "")}.jpg', quality=82, optimize=True)
    return ci, zn

if __name__ == '__main__':
    mp.set_start_method('fork')
    work = [(ci, zn) for ci in POSES for zn in ZN]
    out = {str(ci): {'name': cams[ci]['img_name'], 'holes': {}, 'opacity': {}} for ci in POSES}
    with mp.Pool(6) as p:
        for i, (ci, zn, holes, op) in enumerate(p.imap_unordered(job, work, chunksize=2)):
            out[str(ci)]['holes'][str(zn)] = round(holes, 2)
            out[str(ci)]['opacity'][str(zn)] = round(op, 4)
            if i % 7 == 0: print(f'  measure {i}/{len(work)}', flush=True)
        for i, _ in enumerate(p.imap_unordered(shot, work, chunksize=2)):
            if i % 7 == 0: print(f'  render {i}/{len(work)}', flush=True)
    for ci in POSES:
        h, e = hist(ci)
        out[str(ci)]['hist'] = [round(v, 1) for v in h]
        out[str(ci)]['edges'] = [round(v, 4) for v in e]
    json.dump(dict(poses=[str(p) for p in POSES], znear=ZN, w=400, h=300,
                   cut={str(z): round(zcut(z), 5) for z in ZN}, data=out),
              open(f'{OUT}/sweep.json', 'w'))
    for ci in POSES:
        print(ci, cams[ci]['img_name'], out[str(ci)]['holes'], flush=True)
    print('DONE', flush=True)
