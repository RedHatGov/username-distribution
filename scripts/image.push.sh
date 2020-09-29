TAG=${TAG:-latest}

if [[ -z "${QUAY_PROJECT}" ]]; then
  echo "QUAY_PROJECT variable must be set to push image"
  exit 1
fi

docker tag username-distribution:$TAG quay.io/$QUAY_PROJECT/username-distribution:$TAG
docker login quay.io -u $QUAY_USERNAME -p $QUAY_PASSWORD
docker push quay.io/$QUAY_PROJECT/username-distribution:$TAG
