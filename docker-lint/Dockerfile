# Based on the mozilla-central lint image, as it is nice and small.
FROM quay.io/mozilla/lint

# Add git to the image.
RUN apt-get update -y && apt-get install -y git

ADD install-node.sh /build/install-node.sh
RUN bash /build/install-node.sh
