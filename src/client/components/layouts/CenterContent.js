import React, { Component } from 'react';

/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 01, 2019
 */


class CenterContent extends Component {
  render() {
    const col = this.props.col || 'col';

    return (
      <main className="vh-100 d-flex align-items-center justify-content-center">
        <div className={col}>
          {this.props.children}
        </div>
      </main>
    );
  }

}

export default CenterContent;
