/**
 * Módulo de modal de imagem - gerencia visualização em tela cheia de imagens.
 */
(function (global) {
    let _modalImages = [];
    let _modalIndex = -1;

    function _normalizeSrc(s) {
        return String(s || '').trim();
    }

    function _collectModalImages() {
        const imgs = document.querySelectorAll('.comparison-card img, .training-images-area img');
        return Array.from(imgs).map(img => _normalizeSrc(img.src)).filter(Boolean);
    }

    function _showModalAt(index) {
        if (index < 0 || index >= _modalImages.length) return;
        _modalIndex = index;

        const modal = document.getElementById('img-modal');
        const img = document.getElementById('img-modal-img');
        const caption = document.getElementById('img-modal-caption');

        if (!modal || !img) return;

        img.src = _modalImages[index];
        img.alt = `Imagem ${index + 1} de ${_modalImages.length}`;

        if (caption) {
            caption.textContent = `${index + 1} / ${_modalImages.length}`;
            caption.setAttribute('aria-hidden', 'false');
        }

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    }

    function openImageModal(src, alt) {
        _modalImages = _collectModalImages();
        const normalized = _normalizeSrc(src);
        _modalIndex = _modalImages.findIndex(s => s === normalized);
        if (_modalIndex < 0) _modalIndex = 0;
        _showModalAt(_modalIndex);
    }

    function closeImageModal() {
        const modal = document.getElementById('img-modal');
        const caption = document.getElementById('img-modal-caption');
        if (modal) {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (caption) caption.setAttribute('aria-hidden', 'true');
        _modalImages = [];
        _modalIndex = -1;
    }

    function modalNext() {
        if (_modalIndex < _modalImages.length - 1) _showModalAt(_modalIndex + 1);
    }

    function modalPrev() {
        if (_modalIndex > 0) _showModalAt(_modalIndex - 1);
    }

    // Event Listeners Globais
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'img-modal-close' || target.id === 'img-modal-backdrop') {
            closeImageModal();
        }
    });

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'img-modal-next') {
            modalNext();
        } else if (target.id === 'img-modal-prev') {
            modalPrev();
        }
    });

    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('img-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (e.key === 'Escape') closeImageModal();
        else if (e.key === 'ArrowRight') modalNext();
        else if (e.key === 'ArrowLeft') modalPrev();
    });

    // Expõe no escopo global
    global.ImageModal = {
        open: openImageModal,
        close: closeImageModal,
        next: modalNext,
        prev: modalPrev
    };

})(window);
