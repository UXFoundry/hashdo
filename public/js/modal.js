/* global $, card */

card.modal = {
  onOpen: function () {},
  onClose: function () {},

  open: function (html) {
    // ensure closed
    if ($('.hdc-modal').length > 0) {
      $('.hdc-modal').remove();
    }

    // add to doc and open
    $(document).find('body').prepend('<div class="hdc-modal open"><div><a href="#close" title="Close">&nbsp;</a><div class="hdc-modal-body"></div></div></div>');

    var $modal = $('.hdc-modal');

    // on close
    $modal.find('a[href="#close"]').on('click', function () {
      $('.hdc-modal').remove();

      // reinstate message container scrolling
      $('.messages-content').css('overflow', 'auto');

      // trigger close event
      card.modal.onClose && card.modal.onClose();
    });

    // populate
    if (html) {
      $('.hdc-modal-body').html(html);
    }

    // prevent message container from scrolling
    $('.messages-content').css('overflow', 'hidden');

    // trigger open event
    card.modal.onOpen && card.modal.onOpen($modal);

    return $modal;
  },

  populate: function (html) {
    $('.hdc-modal-body').html(html);
  },

  close: function () {
    $('.hdc-modal').remove();

    // reinstate message container scrolling
    $('.messages-content').css('overflow', 'auto');

    // trigger close event
    card.modal.onClose && card.modal.onClose();
  }
};