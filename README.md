# Journal Digital Corpus Reader

A web-based search interface for the
[Journal Digital Corpus](https://zenodo.org/records/17340776) - transcripts
from Swedish historical newsreels (SF Veckorevy).

## Features

- **Full-text search** across ~6,800 transcript files
- **Fuzzy search** for finding matches despite OCR/ASR errors
- **Filter** by transcript type (speech/intertitle), collection, and year
- **Side-by-side viewer** showing speech and intertitle transcripts with
  timestamps
- **Shareable URLs** for bookmarking searches and specific videos
- **Client-side only** - loads corpus directly from Zenodo, no backend required

## Usage

Visit the hosted version at: `https://[username].github.io/jdc_browser/`

Or run locally:

```bash
git clone https://github.com/[username]/jdc_browser.git
cd jdc_browser
python3 -m http.server 8000
# Open http://localhost:8000
```

## Deployment to GitHub Pages

1. Push the repository to GitHub
2. Go to Settings > Pages
3. Set source to "Deploy from a branch" and select `main` / `root`
4. The site will be available at `https://[username].github.io/jdc_browser/`

## Data Source

The corpus is loaded directly from Zenodo at runtime (~13 MB download). It
contains:

- **Speech transcripts**: Automatic speech recognition via
  [SweScribe](https://github.com/Modern36/swescribe)
- **Intertitle transcripts**: OCR from silent film text cards via
  [stum](https://github.com/Modern36/stum)

**DOI**: [10.5281/zenodo.15596191](https://doi.org/10.5281/zenodo.15596191)

Source repository:
[Modern36/journal_digital_corpus](https://github.com/Modern36/journal_digital_corpus)

## Credits

Developed for the [Modern Times 1936](https://modernatider1936.se/en/) research
[project at Lund University](https://portal.research.lu.se/sv/projects/modern-times-1936-2),
Sweden. The project investigates what software "sees," "hears," and "perceives"
when pattern recognition technologies such as 'AI' are applied to media
historical sources. The project is
[funded by Riksbankens Jubileumsfond](https://www.rj.se/bidrag/2021/moderna-tider-1936/).

### License

The Journal Digital Corpus is licensed under the [CC-BY-NC 4.0](./LICENSE)
[International license]((https://creativecommons.org/licenses/by-nc/4.0/).).



## References

```bib
@article{aspenskog2025journal,
  title={Journal Digital Corpus: Swedish Newsreel Transcriptions},
  author={Aspenskog, Robert and Johansson, Mathias and Snickars, Pelle},
  journal={Journal of Open Humanities Data},
  volume={11},
  number={1},
  year={2025}
}
```
