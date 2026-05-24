I am building an open-source ZooMS (Zooarchaeology by Mass Spectrometry) spectral viewer and taxonomic classifier. I need comprehensive technical research:
>
> 1. **ZooMS workflow**: Describe the complete ZooMS laboratory and analytical workflow from bone fragment to species identification. What sample preparation steps occur? What MALDI-TOF instrument settings are standard? What quality criteria indicate a successful spectrum?
>
> 2. **Marker database**: What are the published ZooMS peptide marker sets for taxonomic identification? Who published them and when? What taxa are currently covered? Is there a single curated open-access database of all validated markers, or are they scattered across papers? Provide a comprehensive list of known markers for common European, African, and Asian fauna.
>
> 3. **Existing software**: Provide a detailed technical analysis of PAMPA, SpecieScan, and any other open-source or proprietary ZooMS classification software. What algorithms do they use? What are their input/output formats? What are their limitations?
>
> 4. **mzML file format**: What is the mzML file format specification? What are the key data fields relevant to ZooMS (m/z arrays, intensity arrays, scan metadata)? Which Python libraries parse it best? What proprietary instrument formats need conversion to mzML and what tools perform that conversion?
>
> 5. **Peak matching algorithms**: What peak matching algorithms are used for MALDI-TOF peptide mass fingerprinting? What mass tolerance windows are standard for MALDI-TOF vs MALDI-FTICR instruments? How are match scores typically calculated and normalised?
>
> 6. **Machine learning for ZooMS**: Have any machine learning approaches (CNN, random forest, etc.) been applied to automate ZooMS species classification? What training data would be required and are any open spectral libraries available for model training?
>
> 7. **Community needs**: Search for discussions in zooarchaeology forums, Twitter/X archaeology communities, and recent methods papers about pain points in ZooMS data processing.


8. **Machine learning for ZooMS peptide identification**: What published research exists on using machine learning (random forests, CNNs, autoencoders) to automatically classify MALDI-TOF mass spectra for species identification? What training data sizes are needed? What feature extraction approaches work best for mass spectrometry data (peak picking, binning, wavelet transform)? Could a trained classifier replace or supplement manual marker matching in ZooMS?
