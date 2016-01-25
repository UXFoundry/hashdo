card.proxy = {
  post: function (endpoint, params, callback) {
    if (endpoint) {
      $.post(baseUrl + '/api/card/proxy/post',
        {
          cardKey: locals.card.key,
          apiKey: locals.card.apiKey,
          endpoint: endpoint,
          params: JSON.stringify(params)
        },
        function (response) {
          if (response.error) {
            callback && callback(response.message);
          }
          else {
            callback && callback(null, response);
          }
        }
      );
    }
    else {
      callback && callback('Invalid endpoint.');
    }
  }
};